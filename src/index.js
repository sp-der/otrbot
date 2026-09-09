require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { syncServer } = require('./services/syncServer');
const { ensureRulesGate, handleRulesReaction } = require('./services/rulesGate');
const { ensureCommunityCards } = require('./services/communityCards');
const { syncFoundationMember } = require('./services/membership');
const { handleSupportInteraction, removeSharedCloseControls } = require('./services/supportTickets');
const { Activity } = require('./services/activity');
const { postOnboarding, paidWelcome } = require('./services/onboarding');
const { startWhopWebhookServer } = require('./services/whopWebhook');
const { WhopManager } = require('./services/whopManager');
const { createForumPost, listForumPosts } = require('./services/whopApi');

let activity;
const token = process.env.DISCORD_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const syncEnabled = String(process.env.ENABLE_SERVER_SYNC).toLowerCase() === 'true';
const whopAnnouncementsExperienceId = String(process.env.WHOP_ANNOUNCEMENTS_EXPERIENCE_ID || 'exp_f1WfbYq4qNxNJU').trim();
const discordAnnouncementsChannelId = String(process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID || '').trim();
const discordAnnouncementsChannelName = String(process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_NAME || '📢・announcements').trim();
const whopAnnouncementPollMs = Math.max(15000, Number(process.env.WHOP_ANNOUNCEMENT_POLL_MS || 30000));
let whopAnnouncementTimer = null;
let whopAnnouncementPolling = false;
const ownerIds = new Set(
  String(process.env.BOT_OWNER_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
);

if (!token) {
  console.error('Missing DISCORD_TOKEN. Add it as a Railway environment variable.');
  process.exit(1);
}
if (!guildId) {
  console.error('Missing DISCORD_GUILD_ID.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});
const whopManager = new WhopManager(client, guildId);

const commands = [
  new SlashCommandBuilder().setName('rank').setDescription('View your Trading Foundation XP and rank.')
    .addUserOption(o => o.setName('member').setDescription('Member to view')),
  new SlashCommandBuilder().setName('leaderboard').setDescription('View the Foundation activity leaderboard.')
    .addStringOption(o => o.setName('view').setDescription('Activity type').addChoices(
      { name: 'Combined XP', value: 'combined' }, { name: 'Message XP', value: 'text' }, { name: 'Voice time', value: 'voice' })),
  new SlashCommandBuilder().setName('ticket-controls').setDescription('Show private staff controls for this support ticket.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('health').setDescription('Check whether OTR Bot is online and connected.'),
  new SlashCommandBuilder().setName('sync').setDescription('Sync The Trading Foundation server blueprint.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('whop-status').setDescription('Check the Whop integration without exposing secrets.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('whop-sync').setDescription('Reconcile Whop memberships with Discord paid roles.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

function canManage(interaction) {
  if (ownerIds.has(interaction.user.id)) return true;
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

client.once('clientReady', async () => {
  console.log(`OTR Bot online as ${client.user.tag}`);
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.error(`Could not access guild ${guildId}. Confirm the bot is installed in the correct server.`);
    return;
  }

  await guild.commands.set(commands);
  console.log(`Registered slash commands in ${guild.name}.`);
  try { await removeSharedCloseControls(guild, client.user.id); }
  catch (error) { console.error('[support] shared-control cleanup failed', error.name, error.code || 'unknown'); }

  if (syncEnabled) {
    try { await syncServer(guild, client.user.id, { rebuildBefore: process.env.DISCORD_REBUILD_BEFORE }); }
    catch (error) { console.error('Startup server sync failed:', error); return; }
  } else {
    console.log('Automatic server sync is disabled. Set ENABLE_SERVER_SYNC=true when ready.');
  }

  try {
    await ensureRulesGate(guild, client.user.id);
    await ensureCommunityCards(guild, client.user.id);
    if (process.env.DATABASE_URL) {
      activity = new Activity(client, guild);
      try { await activity.init(); }
      catch (error) { console.error('[xp] initialization failed', error.code || error.name); activity = null; }
      try { await whopManager.init(); startWhopAnnouncementMirror(); }
      catch (error) { console.error('[whop] initialization failed', error.code || error.name); }
    } else {
      console.warn('[xp] DATABASE_URL missing; XP disabled until persistent database is connected');
      console.warn('[whop] DATABASE_URL missing; durable Whop membership processing is disabled');
    }
  } catch (error) {
    console.error('Rules gate setup failed:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.guildId !== guildId) return;
  if (interaction.isButton() || interaction.isModalSubmit()
    || (interaction.isChatInputCommand() && interaction.commandName === 'ticket-controls')) {
    try { await handleSupportInteraction(interaction, client.user.id); }
    catch (error) {
      console.error('[support] interaction failed', error.name, error.code || 'unknown');
      const response = { content: 'We could not finish that request. Please try again shortly.', allowedMentions: { parse: [] } };
      if (interaction.deferred || interaction.replied) await interaction.editReply(response).catch(() => {});
      else await interaction.reply({ ...response, ephemeral: true }).catch(() => {});
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  if (['rank', 'leaderboard'].includes(interaction.commandName)) {
    if (!activity) { await interaction.reply({ content: 'The activity system is not available yet. Please try again shortly.', ephemeral: true }); return; }
    try { await activity.command(interaction); }
    catch (error) { console.error('[xp] command failed', error.code || error.name); if (interaction.deferred) await interaction.editReply('Unable to load activity right now. Please try again.').catch(() => {}); }
    return;
  }

  if (interaction.commandName === 'health') {
    await interaction.reply({ content: `🐅 OTR Bot is online. Guild: ${interaction.guild?.name || guildId}. Sync: ${syncEnabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'whop-status') {
    if (!canManage(interaction)) { await interaction.reply({ content: 'You do not have permission to view Whop status.', ephemeral: true }); return; }
    await interaction.deferReply({ ephemeral: true });
    try {
      const status = await whopManager.status();
      const products = status.products.length
        ? status.products.map(p => `• ${p.tier || 'unmapped'}: ${p.title} (${p.id})`).join('\n')
        : '• No products discovered yet';
      const last = status.lastSyncResult ? JSON.stringify(status.lastSyncResult) : 'not run yet';
      await interaction.editReply(`💳 **Whop Integration**\nAPI: ${status.apiConfigured ? '✅' : '❌'} • Webhook: ${status.webhookConfigured ? '✅' : '❌'}\nDB events: ${status.counts.events} • Memberships: ${status.counts.memberships} • Discord-linked users: ${status.counts.linkedUsers}\n\n${products}\n\nLast full sync: ${last}`);
    } catch (error) {
      console.error('[whop] status command failed', error.code || error.name);
      await interaction.editReply(`❌ Whop status failed: ${error.code || error.name}`);
    }
    return;
  }

  if (interaction.commandName === 'whop-sync') {
    if (!canManage(interaction)) { await interaction.reply({ content: 'You do not have permission to sync Whop.', ephemeral: true }); return; }
    await interaction.deferReply({ ephemeral: true });
    try {
      await whopManager.refreshProducts();
      const result = await whopManager.syncAll();
      await interaction.editReply(`✅ Whop sync complete: ${result.memberships} memberships across ${result.users} users. ${result.linked} have Discord linked; ${result.inGuild} are currently in this server.`);
    } catch (error) {
      console.error('[whop] manual sync failed', error.code || error.name);
      await interaction.editReply(`❌ Whop sync failed: ${error.code || error.name}. Check Railway logs for the API/permission error.`);
    }
    return;
  }

  if (interaction.commandName === 'sync') {
    if (!canManage(interaction)) { await interaction.reply({ content: 'You do not have permission to run the server sync.', ephemeral: true }); return; }
    if (!syncEnabled) {
      await interaction.reply({ content: 'Server sync is locked. Set `ENABLE_SERVER_SYNC=true` in Railway, redeploy, then run `/sync` again.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await syncServer(interaction.guild, client.user.id);
      await ensureRulesGate(interaction.guild, client.user.id);
      await ensureCommunityCards(interaction.guild, client.user.id);
      await interaction.editReply(`✅ Blueprint synced: ${result.roles} roles, ${result.categories} categories, ${result.channels} channels checked/created. Rules gate refreshed.`);
    } catch (error) {
      console.error('/sync failed:', error);
      await interaction.editReply('❌ Sync failed. Check the Railway logs for the exact Discord permission/API error.');
    }
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  try { await handleRulesReaction(reaction, user, client.user.id); }
  catch (error) { console.error('Rules reaction handling failed:', error); }
});

client.on('guildMemberUpdate', async (before, member) => {
  if (member.guild.id !== guildId) return;
  if (before.roles.cache.equals(member.roles.cache)) return;
  try { await syncFoundationMember(member); if (activity) await activity.onMember(member); await paidWelcome(before, member); }
  catch (error) { console.error('Foundation role update failed:', error); }
});

for (const [event, joined] of [['guildMemberAdd', true], ['guildMemberRemove', false]]) {
  client.on(event, async member => {
    if (member.guild.id !== guildId) return;
    try { await postOnboarding(member, joined); if (activity) await activity.store.record(member, false, !joined); }
    catch (error) { console.error('Member activity post failed:', error); }
  });
}

function announcementMarkdown(message) {
  const parts = [];
  const content = String(message.content || '').trim();
  if (content) parts.push(content);

  for (const attachment of message.attachments.values()) {
    const label = String(attachment.name || 'Discord attachment').replace(/[\[\]]/g, '');
    if (attachment.url) parts.push(`[${label}](${attachment.url})`);
  }

  const author = message.member?.displayName || message.author?.globalName || message.author?.username;
  const meta = [];
  if (author) meta.push(`Posted by ${author} in Discord`);
  if (message.url) meta.push(`[View original message](${message.url})`);
  if (meta.length) parts.push(`_${meta.join(' · ')}_`);
  return parts.join('\n\n').trim();
}

function whopSyncEvent(postId, type = 'forum.announcement.sync') {
  return {
    id: `forum-sync:${postId}`,
    type,
    company_id: process.env.WHOP_COMPANY_ID || undefined,
    data: { id: postId },
  };
}

async function mirrorAnnouncementToWhop(message) {
  if (!message || message.guildId !== guildId || message.author?.bot) return;
  const isAnnouncementChannel = discordAnnouncementsChannelId
    ? message.channelId === discordAnnouncementsChannelId
    : message.channel?.name === discordAnnouncementsChannelName;
  if (!isAnnouncementChannel) return;

  const content = announcementMarkdown(message);
  if (!content) return;
  const post = await createForumPost(whopAnnouncementsExperienceId, { content });
  if (post?.id && process.env.DATABASE_URL) {
    await whopManager.store.claimEvent(whopSyncEvent(post.id, 'forum.announcement.discord_to_whop'));
  }
  console.log(`[whop] mirrored Discord announcement ${message.id}${post?.id ? ` -> ${post.id}` : ''}`);
}

function whopAnnouncementText(post) {
  const parts = [];
  const title = String(post?.title || '').trim();
  const content = String(post?.content || '').trim();
  if (title) parts.push(`**${title.slice(0, 180)}**`);
  if (content) parts.push(content);
  const author = post?.user?.name || post?.user?.username;
  if (author) parts.push(`_Posted by ${String(author).slice(0, 80)} on Whop_`);
  const text = parts.join('\n\n').trim();
  return text.length <= 1950 ? text : `${text.slice(0, 1910)}\n\n…View the full announcement in Whop.`;
}

async function resolveDiscordAnnouncementsChannel() {
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;
  if (discordAnnouncementsChannelId) {
    const byId = guild.channels.cache.get(discordAnnouncementsChannelId)
      || await guild.channels.fetch(discordAnnouncementsChannelId).catch(() => null);
    if (byId?.isTextBased?.()) return byId;
  }
  return guild.channels.cache.find(c => c.name === discordAnnouncementsChannelName && c.isTextBased?.()) || null;
}

async function mirrorWhopAnnouncementsToDiscord() {
  if (whopAnnouncementPolling || !process.env.DATABASE_URL) return;
  whopAnnouncementPolling = true;
  try {
    const channel = await resolveDiscordAnnouncementsChannel();
    if (!channel) throw Object.assign(new Error('Discord announcements channel is unavailable'), { code: 'DISCORD_ANNOUNCEMENTS_CHANNEL_MISSING' });
    const posts = await listForumPosts(whopAnnouncementsExperienceId);
    const topLevel = posts
      .filter(post => post?.id && !post?.parent_id)
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    for (const post of topLevel) {
      const syncEvent = whopSyncEvent(post.id, 'forum.announcement.whop_to_discord');
      const claimed = await whopManager.store.claimEvent(syncEvent);
      if (!claimed) continue;
      try {
        const content = whopAnnouncementText(post);
        if (content) await channel.send({ content, allowedMentions: { parse: [] } });
        console.log(`[whop] mirrored Whop announcement ${post.id} to Discord`);
      } catch (error) {
        await whopManager.store.releaseEvent(syncEvent.id).catch(() => {});
        throw error;
      }
    }
  } finally {
    whopAnnouncementPolling = false;
  }
}

function startWhopAnnouncementMirror() {
  if (whopAnnouncementTimer || !process.env.DATABASE_URL) return;
  const run = () => mirrorWhopAnnouncementsToDiscord()
    .catch(error => console.error('[whop] reverse announcement mirror failed', error.code || error.name, error.message));
  run();
  whopAnnouncementTimer = setInterval(run, whopAnnouncementPollMs);
  whopAnnouncementTimer.unref?.();
  console.log(`[whop] Whop -> Discord announcement mirror scheduled every ${Math.round(whopAnnouncementPollMs / 1000)}s`);
}

client.on('messageCreate', message => {
  if (activity) activity.onMessage(message).catch(e => console.error('[xp] message failed', e.code || e.name));
  mirrorAnnouncementToWhop(message).catch(e => console.error('[whop] announcement mirror failed', e.code || e.name, e.message));
});
client.on('voiceStateUpdate', (oldState, state) => { if (activity && state.guild.id === guildId) activity.tick().catch(e => console.error('[xp] voice update failed', e.code || e.name)); });
client.on('shardDisconnect', () => { if (activity) activity.voice.clear(); });
client.on('shardResume', () => { if (activity) activity.tick().catch(() => {}); });
client.on('error', error => console.error('Discord client error:', error));
process.on('unhandledRejection', error => console.error('Unhandled rejection:', error));

startWhopWebhookServer({ client, guildId, onEvent: event => whopManager.acceptEvent(event) });
client.login(token);
