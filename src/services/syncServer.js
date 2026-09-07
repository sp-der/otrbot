const {
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const blueprint = require('../config/serverBlueprint');

const STAFF_ROLE_KEYS = ['dontradez', 'admin', 'moderator'];

function sameName(collection, name) {
  return collection.find((item) => item.name === name);
}

async function ensureRoles(guild) {
  await guild.roles.fetch();
  const roleMap = new Map();

  for (const definition of blueprint.roles) {
    let role = sameName(guild.roles.cache, definition.name);

    if (!role) {
      role = await guild.roles.create({
        name: definition.name,
        color: definition.color,
        hoist: definition.hoist,
        mentionable: false,
        reason: 'OTR Bot server blueprint sync',
      });
      console.log(`[sync] created role: ${definition.name}`);
    } else {
      const patch = {};
      if (role.color !== definition.color) patch.color = definition.color;
      if (role.hoist !== definition.hoist) patch.hoist = definition.hoist;
      if (Object.keys(patch).length) {
        await role.edit({ ...patch, reason: 'OTR Bot server blueprint sync' });
        console.log(`[sync] updated role: ${definition.name}`);
      }
    }

    roleMap.set(definition.key, role);
  }

  return roleMap;
}

function buildOverwrites(guild, clientUserId, accessKey, roleMap) {
  if (accessKey === 'public') return [];

  const allowedKeys = new Set([
    ...STAFF_ROLE_KEYS,
    ...(blueprint.access[accessKey] || []),
  ]);

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: clientUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
      ],
    },
  ];

  for (const key of allowedKeys) {
    const role = roleMap.get(key);
    if (!role) continue;
    overwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
      ],
    });
  }

  return overwrites;
}

async function ensureCategory(guild, group, roleMap, clientUserId) {
  await guild.channels.fetch();
  let category = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildCategory &&
      channel.name === group.category,
  );

  const permissionOverwrites = buildOverwrites(
    guild,
    clientUserId,
    group.access,
    roleMap,
  );

  if (!category) {
    category = await guild.channels.create({
      name: group.category,
      type: ChannelType.GuildCategory,
      permissionOverwrites,
      reason: 'OTR Bot server blueprint sync',
    });
    console.log(`[sync] created category: ${group.category}`);
  } else if (group.access !== 'public') {
    await category.permissionOverwrites.set(
      permissionOverwrites,
      'OTR Bot server blueprint sync',
    );
  }

  return category;
}

async function ensureChild(guild, category, definition, group, roleMap, clientUserId) {
  await guild.channels.fetch();
  let channel = guild.channels.cache.find(
    (candidate) =>
      candidate.name === definition.name &&
      candidate.parentId === category.id &&
      candidate.type === definition.type,
  );

  const permissionOverwrites = buildOverwrites(
    guild,
    clientUserId,
    group.access,
    roleMap,
  );

  if (!channel) {
    const createOptions = {
      name: definition.name,
      type: definition.type,
      parent: category.id,
      permissionOverwrites,
      reason: 'OTR Bot server blueprint sync',
    };

    if (definition.type === ChannelType.GuildText && definition.topic) {
      createOptions.topic = definition.topic;
    }

    channel = await guild.channels.create(createOptions);
    console.log(`[sync] created channel: ${definition.name}`);
    return channel;
  }

  const patch = {};
  if (definition.type === ChannelType.GuildText && channel.topic !== definition.topic) {
    patch.topic = definition.topic;
  }
  if (channel.parentId !== category.id) patch.parent = category.id;

  if (Object.keys(patch).length) {
    await channel.edit({ ...patch, reason: 'OTR Bot server blueprint sync' });
    console.log(`[sync] updated channel: ${definition.name}`);
  }

  if (group.access !== 'public') {
    await channel.permissionOverwrites.set(
      permissionOverwrites,
      'OTR Bot server blueprint sync',
    );
  }

  return channel;
}

async function syncServer(guild, clientUserId) {
  console.log(`[sync] starting blueprint sync for ${guild.name} (${guild.id})`);

  const roleMap = await ensureRoles(guild);

  for (const group of blueprint.channels) {
    const category = await ensureCategory(guild, group, roleMap, clientUserId);
    for (const child of group.children) {
      await ensureChild(guild, category, child, group, roleMap, clientUserId);
    }
  }

  console.log('[sync] blueprint sync complete');
  return {
    roles: blueprint.roles.length,
    categories: blueprint.channels.length,
    channels: blueprint.channels.reduce((count, group) => count + group.children.length, 0),
  };
}

module.exports = { syncServer };
