const path = require('node:path');
const {
  ChannelType, PermissionFlagsBits: P, PermissionsBitField,
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
  AttachmentBuilder, MessageFlags, escapeMarkdown,
} = require('discord.js');
const { buildCard } = require('./communityCards');
const blueprint = require('../config/serverBlueprint');
const CATEGORY = '━━ SUPPORT TICKETS ━━';
const PANEL = '🎫・support';
const STAFF_KEYS = ['dontradez', 'admin', 'moderator'];
const STAFF_NAMES = blueprint.roles.filter(r => STAFF_KEYS.includes(r.key)).map(r => r.name);
const HEADER = 'ttf-rules-header.png';
const inFlight = new Map();
const READ = [P.ViewChannel, P.ReadMessageHistory];
const WRITE = [P.SendMessages, P.AttachFiles, P.EmbedLinks, P.AddReactions];
const NO_THREADS = [P.CreatePublicThreads, P.CreatePrivateThreads, P.SendMessagesInThreads];

function ticketState(channel) {
  const match = /^otr-ticket:v1:(\d+):(open|closed)$/.exec(channel?.topic || '');
  return match ? { ownerId: match[1], status: match[2] } : null;
}
function ticketOverwrites(guild, botId, ownerId, staffRoles, closed = false) {
  const items = [
    { id: guild.id, type: 0, deny: [P.ViewChannel, ...NO_THREADS, P.MentionEveryone] },
    ...staffRoles.map(role => ({ id: role.id, type: 0, allow: [...READ, ...WRITE, P.ManageMessages] })),
    { id: botId, type: 1, allow: [...READ, ...WRITE, P.ManageChannels, P.ManageMessages] },
  ];
  items.push({ id: ownerId, type: 1, allow: [...READ, ...(closed ? [] : WRITE)],
    deny: [P.MentionEveryone, ...NO_THREADS, ...(closed ? WRITE : [])] });
  return items;
}
function validateOverwrites(channel, expected) {
  if (channel.permissionOverwrites.cache.size !== expected.length) throw new Error('Unexpected ticket access');
  for (const item of expected) {
    const actual = channel.permissionOverwrites.cache.get(item.id);
    if (!actual || actual.type !== item.type
      || actual.allow.bitfield !== new PermissionsBitField(item.allow || []).bitfield
      || actual.deny.bitfield !== new PermissionsBitField(item.deny || []).bitfield) {
      throw new Error('Ticket permission verification failed');
    }
  }
}
function getStaffRoles(guild) {
  return STAFF_NAMES.map(name => {
    const role = guild.roles.cache.find(r => r.name === name);
    if (!role) throw new Error('Required support role missing');
    return role;
  });
}
function ticketPayload(ownerId, reason) {
  const definition = { id: 105, title: 'YOUR SUPPORT TICKET', body: [
    { type: 10, content: `<@${ownerId}>, your ticket is now open. Don and the support team will respond shortly.` },
    { type: 10, content: `**Reason for your ticket**\n${escapeMarkdown(reason)}` },
    { type: 1, components: [{ type: 2, style: 2, custom_id: 'support:close', label: 'Close Ticket (Staff)', emoji: { name: '🔒' } }] },
  ] };
  return { flags: MessageFlags.IsComponentsV2, components: [buildCard(definition)],
    files: [new AttachmentBuilder(path.join(__dirname, '../../assets', HEADER), { name: HEADER })],
    allowedMentions: { parse: [] } };
}
function reasonModal() {
  return new ModalBuilder().setCustomId('support:reason').setTitle('Open a Support Ticket')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('What is the reason for your ticket?')
        .setStyle(TextInputStyle.Paragraph).setPlaceholder('Tell us what you need help with…')
        .setRequired(true).setMinLength(1).setMaxLength(1500),
    ));
}
async function createTicket(guild, user, botId, reason) {
  if (!reason.trim() || reason.length > 1500) throw new Error('Invalid ticket reason');
  if (user.bot || user.id === botId) throw new Error('Tickets require a member');
  const key = `${guild.id}:${user.id}`;
  if (inFlight.has(key)) return { ...(await inFlight.get(key)), existing: true };
  const task = (async () => {
    await guild.channels.fetch();
    await guild.roles.fetch();
    const category = guild.channels.cache.find(c => c.name === CATEGORY && c.type === ChannelType.GuildCategory);
    if (!category) throw new Error('Support tickets are not ready');
    const existing = guild.channels.cache.find(c => c.parentId === category.id
      && ticketState(c)?.ownerId === user.id && ticketState(c)?.status === 'open');
    if (existing) return { channel: existing, existing: true };
    const staff = getStaffRoles(guild);
    const overwrites = ticketOverwrites(guild, botId, user.id, staff);
    const channel = await guild.channels.create({ name: `ticket-${user.id}`, type: ChannelType.GuildText,
      parent: category.id, topic: `otr-ticket:v1:${user.id}:open`,
      permissionOverwrites: overwrites, reason: 'Member opened a private support ticket' });
    // Check exact overwrites before posting any private reason into the new channel.
    try {
      const verified = await guild.channels.fetch(channel.id);
      validateOverwrites(verified, overwrites);
      await channel.send(ticketPayload(user.id, reason.trim()));
    } catch (error) {
      // Roll back only this freshly-created ticket if setup did not complete.
      await channel.delete('Incomplete support ticket setup').catch(() => {});
      throw error;
    }
    console.log(`[support] opened ticket channel=${channel.id}`);
    return { channel, existing: false };
  })();
  inFlight.set(key, task);
  try { return await task; } finally { if (inFlight.get(key) === task) inFlight.delete(key); }
}
async function closeTicket(interaction, botId) {
  const { guild, channel } = interaction;
  const state = ticketState(channel);
  if (!state || channel.parent?.name !== CATEGORY) {
    await interaction.editReply('This is not a support ticket.'); return;
  }
  const member = await guild.members.fetch({ user: interaction.user.id, force: true });
  if (!member.roles.cache.some(r => STAFF_NAMES.includes(r.name)) && guild.ownerId !== member.id) {
    await interaction.editReply('Only Don, Admin, or Moderators can close a ticket.'); return;
  }
  if (state.status === 'closed') { await interaction.editReply('This ticket is already closed.'); return; }
  await guild.roles.fetch();
  const overwrites = ticketOverwrites(guild, botId, state.ownerId, getStaffRoles(guild), true);
  await channel.edit({ name: `closed-${state.ownerId}`, topic: `otr-ticket:v1:${state.ownerId}:closed`,
    permissionOverwrites: overwrites, reason: 'Support staff closed the ticket' });
  validateOverwrites(await guild.channels.fetch(channel.id), overwrites);
  await channel.send({ content: '🔒 This ticket has been closed by the support team. Its conversation remains available here. If you need more help, open a new ticket in Support.', allowedMentions: { parse: [] } });
  await interaction.editReply('Ticket closed. The conversation has been preserved.');
  console.log(`[support] closed ticket channel=${channel.id}`);
}
async function handleSupportInteraction(interaction, botId) {
  if (!interaction.guild) return false;
  if (interaction.isButton() && interaction.customId === 'support:open') {
    if (interaction.channel?.name !== PANEL || interaction.message?.author?.id !== botId) return false;
    await interaction.showModal(reasonModal());
    return true;
  }
  if (interaction.isModalSubmit() && interaction.customId === 'support:reason') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (interaction.channel?.name !== PANEL) {
      await interaction.editReply('Please open your ticket from the Support channel.'); return true;
    }
    const reason = interaction.fields.getTextInputValue('reason').trim();
    if (!reason) { await interaction.editReply('Please enter a reason for your ticket.'); return true; }
    const result = await createTicket(interaction.guild, interaction.user, botId, reason);
    await interaction.editReply({ content: result.existing
      ? `You already have an open ticket: <#${result.channel.id}>. You can continue the conversation there.`
      : `Your ticket is now open. Don and the support team will respond shortly. Continue here: <#${result.channel.id}>.`,
      allowedMentions: { parse: [] } });
    return true;
  }
  if (interaction.isButton() && interaction.customId === 'support:close') {
    if (interaction.message?.author?.id !== botId) return false;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await closeTicket(interaction, botId);
    return true;
  }
  return false;
}
module.exports = { ticketState, ticketOverwrites, validateOverwrites, ticketPayload, reasonModal,
  createTicket, closeTicket, handleSupportInteraction };
