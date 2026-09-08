const fs = require('fs');
const path = require('path');
const {
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js');

const RULES_CHANNEL_NAME = '📜・rules';
const MEMBER_ROLE_NAME = '✅ Member';
const RULES_TITLE = '📜 SERVER RULES';
const RULES_HEADER_BASE64_PATH = path.join(__dirname, '../../assets/ttf-rules-header.b64');
const RULES_HEADER_NAME = 'ttf-rules-header-premium.webp';
const GOLD = 0xd4af37;

const ruleFields = [
  {
    name: '🚨 NO FREE PROMOTION',
    value: 'Do not advertise or promote other Discord servers, communities, indicators, Twitch/YouTube channels, social media, products, or services without permission from an Admin.',
  },
  {
    name: '🚨 NO HATE SPEECH OR DISCRIMINATION',
    value: 'Racial slurs, hateful remarks, discrimination, or intentionally offensive comments toward other members will not be tolerated.',
  },
  {
    name: '🚨 NO SPAMMING',
    value: 'Do not flood channels with repeated messages, memes, images, links, reactions, or unnecessary mentions. Keep content relevant to the channel.',
  },
  {
    name: '🚨 NO EXPLICIT OR ILLEGAL CONTENT',
    value: 'Pornography, NSFW material, graphic content, scams, or illegal/unsafe content is strictly prohibited.',
  },
  {
    name: '🚨 NO MALICIOUS BOTS OR AUTOMATION',
    value: 'Do not invite unauthorized bots, use self-bots, mass-DM members, spam users, or introduce anything intended to disrupt or harm the server.',
  },
  {
    name: '🚨 NO DOXXING OR SHARING PRIVATE INFORMATION',
    value: 'Respect everyone’s privacy. Never share another person’s private messages, address, phone number, personal social media, photos, or other identifying information without their permission. This applies to members of this server and people from other communities.',
  },
  {
    name: '🚨 RESPECT OTHER MEMBERS',
    value: 'Arguments and disagreements happen, but excessive harassment, threats, bullying, or intentionally starting drama will not be tolerated.',
  },
  {
    name: '🚨 USE CHANNELS CORRECTLY',
    value: 'Keep conversations and posts in their appropriate channels. Check channel names, descriptions, and pinned messages before posting.',
  },
  {
    name: '⚠️ ENFORCEMENT',
    value: 'Breaking server rules may result in a warning, mute/timeout, kick, or ban depending on the severity and frequency of the violation. Staff decisions are made to protect the community and keep the server enjoyable for everyone.',
  },
  {
    name: '✅ AGREE TO THE RULES',
    value: 'React with ✅ below to confirm you have read and agree to the server rules. Once accepted, OTR Bot will give you the ✅ Member role and unlock the rest of The Trading Foundation.',
  },
];

function buildRulesEmbed() {
  return new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(RULES_TITLE)
    .setDescription('Welcome to The Trading Foundation. Please read the server rules below and react with ✅ to confirm.')
    .addFields(ruleFields)
    .setFooter({ text: 'THE TRADING FOUNDATION • Trade • Learn • Grow • Together' });
}

function isRulesGateMessage(message, botUserId) {
  return Boolean(
    message
      && message.author?.id === botUserId
      && message.embeds?.some((embed) => embed.title === RULES_TITLE),
  );
}

function isRulesHeaderMessage(message, botUserId) {
  return Boolean(
    message
      && message.author?.id === botUserId
      && message.attachments?.some((attachment) => attachment.name?.startsWith('ttf-rules-header')),
  );
}

function loadRulesHeaderBuffer() {
  const base64 = fs.readFileSync(RULES_HEADER_BASE64_PATH, 'utf8').trim();
  return Buffer.from(base64, 'base64');
}

async function ensureRulesGate(guild, botUserId) {
  await guild.channels.fetch();
  const channel = guild.channels.cache.find(
    (candidate) => candidate.name === RULES_CHANNEL_NAME && candidate.isTextBased(),
  );
  if (!channel) throw new Error(`Rules channel ${RULES_CHANNEL_NAME} was not found.`);

  const recent = await channel.messages.fetch({ limit: 50 });
  const stale = recent.filter(
    (message) => isRulesGateMessage(message, botUserId) || isRulesHeaderMessage(message, botUserId),
  );

  for (const message of stale.values()) {
    await message.delete().catch((error) => {
      console.warn(`[rules] could not delete stale rules message ${message.id}:`, error.message);
    });
  }

  const headerAttachment = new AttachmentBuilder(loadRulesHeaderBuffer(), {
    name: RULES_HEADER_NAME,
    description: 'The Trading Foundation',
  });

  const headerMessage = await channel.send({
    files: [headerAttachment],
    allowedMentions: { parse: [] },
  });

  const rulesMessage = await channel.send({
    embeds: [buildRulesEmbed()],
    allowedMentions: { parse: [] },
  });

  await rulesMessage.react('✅');
  console.log(
    `[rules] posted fresh v4 gate in ${channel.name}: header=${headerMessage.id} rules=${rulesMessage.id}`,
  );
  return rulesMessage;
}

async function handleRulesReaction(reaction, user, botUserId) {
  if (user.bot || reaction.emoji.name !== '✅') return false;

  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (reaction.message.partial) await reaction.message.fetch().catch(() => null);

  const message = reaction.message;
  if (!message.guild || message.channel?.name !== RULES_CHANNEL_NAME) return false;
  if (!isRulesGateMessage(message, botUserId)) return false;

  const role = message.guild.roles.cache.find((candidate) => candidate.name === MEMBER_ROLE_NAME)
    || (await message.guild.roles.fetch()).find((candidate) => candidate.name === MEMBER_ROLE_NAME);
  if (!role) throw new Error(`Member role ${MEMBER_ROLE_NAME} was not found.`);

  const member = await message.guild.members.fetch(user.id);
  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role, 'Accepted The Trading Foundation server rules');
    console.log(`[rules] verified ${user.tag || user.id} (${user.id})`);
  }

  return true;
}

module.exports = {
  ensureRulesGate,
  handleRulesReaction,
  isRulesGateMessage,
};
