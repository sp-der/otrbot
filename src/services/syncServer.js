const { ChannelType, PermissionFlagsBits: P, PermissionsBitField } = require('discord.js');
const blueprint = require('../config/serverBlueprint');
const STAFF = ['dontradez', 'admin', 'moderator'];
const REASON = 'Owner-requested Trading Foundation channel rebuild';
const READ = [P.ViewChannel, P.ReadMessageHistory, P.AddReactions, P.UseApplicationCommands];
const WRITE = [P.SendMessages, P.AttachFiles, P.EmbedLinks, P.CreatePublicThreads, P.SendMessagesInThreads];
const NO_WRITE = [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads, P.SendVoiceMessages, P.UseExternalApps];
const VOICE = [P.Connect, P.Speak, P.Stream, P.UseVAD];
const MOD = [P.ManageMessages, P.ManageThreads, P.ModerateMembers, P.KickMembers, P.MuteMembers, P.DeafenMembers, P.MoveMembers, P.ViewAuditLog];
const ADMIN = [...MOD, P.ManageChannels, P.ManageRoles, P.ManageGuild, P.BanMembers];
let running = false;

function rolePermissions(key) {
  return ['dontradez', 'admin'].includes(key) ? [...READ, ...WRITE, ...VOICE, ...ADMIN]
    : key === 'moderator' ? [...READ, ...WRITE, ...VOICE, ...MOD] : [];
}

function buildOverwrites(guild, botId, access, roles, mode = 'chat') {
  const readOnly = mode === 'readonly';
  const audience = { allow: [...READ, ...(readOnly ? [] : WRITE), P.Connect,
    ...(mode === 'listen' ? [] : [P.Speak, P.Stream, P.UseVAD])],
    deny: [P.MentionEveryone, P.SendTTSMessages, P.CreatePrivateThreads,
      ...(readOnly ? NO_WRITE : []),
      ...(mode === 'listen' ? [P.Speak, P.Stream, P.UseSoundboard, P.UseExternalSounds] : [])] };
  const overwrites = [{ id: guild.id, type: 0,
    allow: access === 'public' ? audience.allow : [],
    deny: access === 'public' ? audience.deny : [P.ViewChannel, ...audience.deny] }];
  for (const key of blueprint.access[access] || []) {
    overwrites.push({ id: roles.get(key).id, type: 0, ...audience });
  }
  for (const key of STAFF) overwrites.push({ id: roles.get(key).id, type: 0,
    allow: [...READ, ...WRITE, ...VOICE, P.ManageMessages, P.ManageThreads] });
  overwrites.push({ id: botId, type: 1,
    allow: [...READ, ...WRITE, ...VOICE, P.ManageChannels, P.ManageMessages, P.ManageRoles] });
  return overwrites;
}

async function preflight(guild) {
  await guild.roles.fetch();
  await guild.channels.fetch();
  const me = await guild.members.fetchMe();
  if (guild.roles.everyone.permissions.has(P.Administrator)) throw new Error('@everyone must not have Administrator.');
  for (const permission of [P.ManageChannels, P.ManageRoles]) {
    if (!me.permissions.has(permission)) throw new Error('Bot requires Manage Channels and Manage Roles.');
  }
  for (const definition of blueprint.roles) {
    const existing = guild.roles.cache.find(r => r.name === definition.name);
    if (existing && !existing.editable) throw new Error(`Move OTR Bot above ${definition.name} before syncing.`);
    if (!me.permissions.has(rolePermissions(definition.key))) throw new Error(`Bot cannot grant required permissions for ${definition.name}.`);
  }
}

async function ensureRoles(guild) {
  const map = new Map();
  for (const definition of blueprint.roles) {
    let role = guild.roles.cache.find(r => r.name === definition.name);
    const options = { name: definition.name, color: definition.color, hoist: definition.hoist,
      mentionable: false, permissions: rolePermissions(definition.key), reason: REASON };
    role = role ? await role.edit(options) : await guild.roles.create(options);
    map.set(definition.key, role);
  }
  const ordered = [...blueprint.roles].reverse();
  await guild.roles.setPositions(ordered.map((d, i) => ({ role: map.get(d.key).id, position: i + 1 })));
  return map;
}

// A fixed timestamp targets ONLY channels that existed when this rebuild was requested.
// New channels survive a process restart, even if deployment variables are still enabled.
async function rebuildOldChannels(guild, cutoff) {
  if (!cutoff) return;
  const timestamp = Date.parse(cutoff);
  if (guild.id !== '1423037046498263043' || !Number.isFinite(timestamp) || timestamp > Date.now()) {
    throw new Error('Invalid rebuild guild or fixed cutoff.');
  }
  const old = [...guild.channels.cache.values()].filter(c => c.createdTimestamp <= timestamp);
  if (!old.length) { console.log('[rebuild] no pre-cutoff channels remain'); return; }
  for (const channel of old) if (!channel.deletable) throw new Error(`Cannot delete ${channel.name} (${channel.id}).`);
  if (guild.features.includes('COMMUNITY') && old.some(c => [guild.rulesChannelId, guild.publicUpdatesChannelId].includes(c.id))) {
    throw new Error('Community rules/update channels require reassignment before rebuild.');
  }
  console.log('[rebuild] BEFORE ' + JSON.stringify(old.map(c => ({ id: c.id, name: c.name, type: c.type,
    parentId: c.parentId, position: c.rawPosition, permissionOverwrites: c.permissionOverwrites.cache.toJSON() }))));
  old.sort((a, b) => Number(a.type === ChannelType.GuildCategory) - Number(b.type === ChannelType.GuildCategory));
  for (const channel of old) {
    await channel.delete(REASON);
    console.log(`[rebuild] deleted ${channel.id} ${channel.name}`);
  }
  console.log(`[rebuild] removed ${old.length} original channels/categories`);
}

async function verify(guild, botId, map, records, cutoff) {
  await guild.channels.fetch();
  await guild.roles.fetch();
  for (const { id, group, definition, parentId } of records) {
    const channel = guild.channels.cache.get(id);
    if (!channel || channel.name !== definition.name || channel.type !== definition.type || channel.parentId !== parentId) {
      throw new Error(`Channel layout verification failed: ${definition.name}`);
    }
    const expected = buildOverwrites(guild, botId, group.access, map, definition.mode || 'chat');
    if (channel.permissionOverwrites.cache.size !== expected.length) throw new Error(`Unexpected overwrite: ${channel.name}`);
    for (const item of expected) {
      const actual = channel.permissionOverwrites.cache.get(item.id);
      if (!actual || actual.allow.bitfield !== new PermissionsBitField(item.allow || []).bitfield ||
          actual.deny.bitfield !== new PermissionsBitField(item.deny || []).bitfield) {
        throw new Error(`Permission verification failed: ${channel.name} ${item.id}`);
      }
    }
    for (const role of [guild.roles.everyone, ...map.values()]) {
      const key = [...map].find(([, r]) => r.id === role.id)?.[0];
      const allowed = group.access === 'public' || STAFF.includes(key) || blueprint.access[group.access].includes(key);
      const effective = channel.permissionsFor(role);
      if (effective.has(P.ViewChannel) !== allowed) throw new Error(`Visibility mismatch: ${channel.name} ${role.name}`);
      if (allowed && !STAFF.includes(key)) {
        if (definition.mode === 'readonly' && (effective.has(P.SendMessages) || effective.has(P.SendMessagesInThreads))) throw new Error(`Posting leak: ${channel.name}`);
        if (definition.mode === 'listen' && (effective.has(P.Speak) || effective.has(P.Stream))) throw new Error(`Voice leak: ${channel.name}`);
      }
    }
  }
  if (cutoff && guild.channels.cache.some(c => c.createdTimestamp <= Date.parse(cutoff))) throw new Error('Original channels remain.');
  for (const [key, role] of map) {
    const actual = guild.roles.cache.get(role.id);
    if (actual.permissions.bitfield !== new PermissionsBitField(rolePermissions(key)).bitfield) throw new Error(`Role mismatch: ${key}`);
  }
  console.log('[verify] all channel overwrites, tier/rank visibility, posting, voice and role permissions passed');
}

async function syncServer(guild, botId, { rebuildBefore } = {}) {
  if (running) throw new Error('Server sync already running.');
  running = true;
  try {
    await preflight(guild);
    const map = await ensureRoles(guild);
    await rebuildOldChannels(guild, rebuildBefore);
    const records = [];
    for (const [index, group] of blueprint.channels.entries()) {
      const categoryMode = group.access === 'public' && index === 0 ? 'readonly' : 'chat';
      const categoryOptions = { name: group.category, type: ChannelType.GuildCategory,
        permissionOverwrites: buildOverwrites(guild, botId, group.access, map, categoryMode), reason: REASON };
      let category = guild.channels.cache.find(c => c.name === group.category && c.type === ChannelType.GuildCategory);
      category = category ? await category.edit(categoryOptions) : await guild.channels.create(categoryOptions);
      await category.setPosition(index);
      records.push({ id: category.id, group, definition: { name: group.category, type: ChannelType.GuildCategory, mode: categoryMode }, parentId: null });
      for (const [position, definition] of group.children.entries()) {
        const options = { name: definition.name, type: definition.type, parent: category.id,
          permissionOverwrites: buildOverwrites(guild, botId, group.access, map, definition.mode), reason: REASON };
        if (definition.type === ChannelType.GuildText) options.topic = definition.topic || null;
        let channel = guild.channels.cache.find(c => c.name === definition.name && c.parentId === category.id && c.type === definition.type);
        channel = channel ? await channel.edit(options) : await guild.channels.create(options);
        await channel.setPosition(position);
        records.push({ id: channel.id, group, definition, parentId: category.id });
        console.log(`[sync] ready ${group.access}/${definition.mode || 'chat'} ${channel.id} ${channel.name}`);
      }
    }
    await verify(guild, botId, map, records, rebuildBefore);
    const result = { roles: blueprint.roles.length, categories: blueprint.channels.length,
      channels: blueprint.channels.reduce((n, g) => n + g.children.length, 0) };
    console.log('[sync] VERIFIED COMPLETE ' + JSON.stringify(result));
    return result;
  } finally { running = false; }
}
module.exports = { syncServer, buildOverwrites, rolePermissions, rebuildOldChannels };
