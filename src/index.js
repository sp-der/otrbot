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
const { syncFoundationMember, postMemberActivity } = require('./services/membership');

const { handleSupportInteraction, removeSharedCloseControls } = require('./services/supportTickets');

const { Activity } = require('./services/activity');
const { postOnboarding, paidWelcome } = require('./services/onboarding');
const { startWhopWebhookServer } = require('./services/whopWebhook');
let activity;

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const syncEnabled = String(process.env.ENABLE_SERVER_SYNC).toLowerCase() === 'true';
const ownerIds = new Set(
  String(process.env.BOT_OWNER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
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

const commands = [
  new SlashCommandBuilder().setName('rank').setDescription('View your Trading Foundation XP and rank.')
    .addUserOption(o=>o.setName('member').setDescription('Member to view')),
  new SlashCommandBuilder().setName('leaderboard').setDescription('View the Foundation activity leaderboard.')
    .addStringOption(o=>o.setName('view').setDescription('Activity type').addChoices(
      {name:'Combined XP',value:'combined'},{name:'Message XP',value:'text'},{name:'Voice time',value:'voice'})),
  new SlashCommandBuilder()
    .setName('ticket-controls')
    .setDescription('Show private staff controls for this support ticket.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('health')
    .setDescription('Check whether OTR Bot is online and connected.'),
  new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Sync The Trading Foundation server blueprint.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((command) => command.toJSON());

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
    try {
      await syncServer(guild, client.user.id, { rebuildBefore: process.env.DISCORD_REBUILD_BEFORE });
    } catch (error) {
      console.error('Startup server sync failed:', error);
      return;
    }
  } else {
    console.log('Automatic server sync is disabled. Set ENABLE_SERVER_SYNC=true when ready.');
  }

  try {
    await ensureRulesGate(guild, client.user.id);
    await ensureCommunityCards(guild, client.user.id);
    if(process.env.DATABASE_URL){
      activity=new Activity(client,guild);
      try{await activity.init();}catch(error){console.error('[xp] initialization failed',error.code||error.name);activity=null;}
    }else console.warn('[xp] DATABASE_URL missing; XP disabled until persistent database is connected');
  } catch (error) {
    console.error('Rules gate setup failed:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.guildId !== guildId) return;
  if (interaction.isButton() || interaction.isModalSubmit()
    || (interaction.isChatInputCommand() && interaction.commandName === 'ticket-controls')) {
    try { await handleSupportInteraction(interaction, client.user.id); }
    catch (error) {
      // Ticket reasons and interaction tokens must never enter application logs.
      console.error('[support] interaction failed', error.name, error.code || 'unknown');
      const response = { content: 'We could not finish that request. Please try again shortly.', allowedMentions: { parse: [] } };
      if (interaction.deferred || interaction.replied) await interaction.editReply(response).catch(() => {});
      else await interaction.reply({ ...response, ephemeral: true }).catch(() => {});
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  if (['rank','leaderboard'].includes(interaction.commandName)) {
    if(!activity){await interaction.reply({content:'The activity system is not available yet. Please try again shortly.',ephemeral:true});return;}
    try{await activity.command(interaction);}catch(error){console.error('[xp] command failed',error.code||error.name);if(interaction.deferred)await interaction.editReply('Unable to load activity right now. Please try again.').catch(()=>{});}
    return;
  }
  if (interaction.commandName === 'health') {
    await interaction.reply({
      content: `🐅 OTR Bot is online. Guild: ${interaction.guild?.name || guildId}. Sync: ${syncEnabled ? 'enabled' : 'disabled'}.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === 'sync') {
    if (!canManage(interaction)) {
      await interaction.reply({ content: 'You do not have permission to run the server sync.', ephemeral: true });
      return;
    }

    if (!syncEnabled) {
      await interaction.reply({
        content: 'Server sync is locked. Set `ENABLE_SERVER_SYNC=true` in Railway, redeploy, then run `/sync` again.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await syncServer(interaction.guild, client.user.id);
      await ensureRulesGate(interaction.guild, client.user.id);
      await ensureCommunityCards(interaction.guild, client.user.id);
      await interaction.editReply(
        `✅ Blueprint synced: ${result.roles} roles, ${result.categories} categories, ${result.channels} channels checked/created. Rules gate refreshed.`,
      );
    } catch (error) {
      console.error('/sync failed:', error);
      await interaction.editReply('❌ Sync failed. Check the Railway logs for the exact Discord permission/API error.');
    }
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  try {
    await handleRulesReaction(reaction, user, client.user.id);
  } catch (error) {
    console.error('Rules reaction handling failed:', error);
  }
});

client.on('guildMemberUpdate', async (before, member) => {
  if (member.guild.id !== guildId) return;
  if (before.roles.cache.equals(member.roles.cache)) return;
  try { await syncFoundationMember(member); if(activity)await activity.onMember(member); await paidWelcome(before,member); }
  catch (error) { console.error('Foundation role update failed:', error); }
});
for (const [event, joined] of [['guildMemberAdd', true], ['guildMemberRemove', false]]) {
  client.on(event, async member => {
    if (member.guild.id !== guildId) return;
    try { await postOnboarding(member, joined); if(activity)await activity.store.record(member,false,!joined); }
    catch (error) { console.error('Member activity post failed:', error); }
  });
}

client.on('messageCreate', message=>{if(activity)activity.onMessage(message).catch(e=>console.error('[xp] message failed',e.code||e.name));});
client.on('voiceStateUpdate', (oldState,state)=>{if(activity&&state.guild.id===guildId)activity.tick().catch(e=>console.error('[xp] voice update failed',e.code||e.name));});
client.on('shardDisconnect',()=>{if(activity)activity.voice.clear();});
client.on('shardResume',()=>{if(activity)activity.tick().catch(()=>{});});

client.on('error', (error) => console.error('Discord client error:', error));
process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));

startWhopWebhookServer({ client, guildId });
client.login(token);
