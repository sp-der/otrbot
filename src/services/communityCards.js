const path = require('node:path');
const { AttachmentBuilder, MessageFlags } = require('discord.js');
const HEADER = 'ttf-rules-header.png';
const HEADER_PATH = path.join(__dirname, '../../assets', HEADER);
const WELCOME = 'Learn the basics of day trading and build a strong foundation before risking real money. Understand market structure, technical analysis, risk management, discipline, and consistency.\nBuild a solid understanding of the markets and develop a foundation you can grow from.';
const text = content => ({ type: 10, content });
const section = (title, body) => text(`**${title}**\n${body}`);
const link = (label, url) => ({ type: 1, components: [{ type: 2, style: 5, label, url }] });

function definitions(guild) {
  const channelLink = name => {
    const channel = guild.channels.cache.find(c => c.name === name);
    if (!channel) throw new Error(`Missing destination: ${name}`);
    return `https://discord.com/channels/${guild.id}/${channel.id}`;
  };
  return [
    { id: 101, channel: '👋・welcome', title: 'WELCOME TO THE TRADING FOUNDATION', body: [
      text(WELCOME),
      link('Review & Accept the Rules', channelLink('📜・rules')),
    ] },
    { id: 102, channel: '🎓・choose-your-foundation', title: 'CHOOSE YOUR FOUNDATION', body: [
      section('ESSENTIAL • $50 ONE-TIME', 'Build your foundation with Don’s 10 basic trading videos, available on Discord and Whop when released.\n• Free Community access\n• Shared Foundation member section\n• Essential course channels\n• Existing Essential buyers receive a discount when upgrading; details will be announced.'),
      section('PREMIUM • $100', 'Everything in Essential, plus:\n• Paid Premium community and discussion rooms\n• Don’s advanced strategy and trading journey videos\n• Bubba’s OTE and strategy videos\n• Dedicated spaces to ask strategy questions\nAdvanced videos will be available on both Discord and Whop.'),
      section('PERSONAL GUIDE • $150', 'Everything in Premium, plus:\n• A one-month live course with Don\n• Live teaching and questions\n• Daily trade reviews during the course, around 1–2 selected trades per day across the group\n• Private classroom, course questions, and trade-submission channels'),
      text('Whop enrollment is coming soon. Premium and Personal Guide billing terms, course dates, and upgrade details will be confirmed before enrollment opens.'),
    ] },
    { id: 103, channel: '❓・faq', title: 'FREQUENTLY ASKED QUESTIONS', body: [
      section('Do I need trading experience?', 'No. Essential is built around learning the basics and developing a foundation before risking real money.'),
      section('Can I join the community for free?', 'Yes. Accept the rules to receive Community Member and unlock the free Community section. Paid courses and Foundation rooms require a package.'),
      section('Where will I watch the videos?', 'Course videos will be published on both Discord and Whop. Essential lessons are included in all three packages; advanced Don and Bubba videos are included in Premium and Personal Guide. Videos are being prepared.'),
      section('Which package should I choose?', 'Essential covers the basics. Premium adds advanced videos and paid discussions. Personal Guide adds a one-month live course and daily selected trade reviews. See Choose Your Foundation for the full comparison.'),
      section('Can I upgrade later?', 'Yes. Existing Essential buyers will receive an upgrade discount. The amount and redemption process will be announced when Whop enrollment is ready.'),
      section('When are the live classes?', 'Personal Guide course dates and live-session times will be posted in the course schedule. No dates have been announced yet.'),
      section('Will every submitted trade be reviewed?', 'Personal Guide includes daily reviews during the one-month course, with around 1–2 selected trades reviewed per day across the group. Submitting a trade does not guarantee that it will be selected.'),
      section('Who can post in the video channels?', 'Staff publish the lessons so they stay easy to find. Members can ask questions in the separate student, strategy, or course discussion channels available to their package.'),
      section('What if my paid channels are missing?', 'Contact the team in Support so they can check your package and Discord role. Do not post passwords or payment details in public channels.'),
      section('What are the billing, refund, and post-course access terms?', 'Essential is $50 one-time. Premium is $100 and Personal Guide is $150; their billing frequency, refund policy, and access after the one-month course will be confirmed before enrollment opens.'),
      link('Explore the Packages', channelLink('🎓・choose-your-foundation')),
    ] },
  ];
}

function buildCard(definition) {
  return { type: 17, id: definition.id, accent_color: 0xd4af37, components: [
    { type: 12, items: [{ media: { url: `attachment://${HEADER}` }, description: 'The Trading Foundation' }] },
    text(`## ${definition.title}`), ...definition.body,
    { type: 14, divider: true, spacing: 1 },
    text('-# THE TRADING FOUNDATION • Trade • Learn • Grow • Together'),
  ] };
}
function matches(message, definition, botId) {
  return message.author?.id === botId && (
    message.components?.some(c => c.type === 17 && (c.id === definition.id
      || c.components?.some(t => t.type === 10 && t.content === `## ${definition.title}`)))
    || message.embeds?.some(e => e.title === definition.title));
}
async function ensureCommunityCards(guild, botId) {
  await guild.channels.fetch();
  for (const definition of definitions(guild)) {
    const channel = guild.channels.cache.find(c => c.name === definition.channel && c.isTextBased());
    if (!channel) throw new Error(`Missing card channel: ${definition.channel}`);
    const recent = await channel.messages.fetch({ limit: 100 });
    const existing = recent.find(m => matches(m, definition, botId));
    const payload = { flags: MessageFlags.IsComponentsV2, content: null, embeds: [],
      components: [buildCard(definition)], attachments: [],
      files: [new AttachmentBuilder(HEADER_PATH, { name: HEADER })], allowedMentions: { parse: [] } };
    const message = existing ? await existing.edit(payload) : await channel.send(payload);
    const verified = await channel.messages.fetch({ message: message.id, force: true });
    if (!matches(verified, definition, botId) || verified.components[0]?.components[0]?.type !== 12) {
      throw new Error(`Card verification failed: ${definition.channel}`);
    }
    console.log(`[cards] verified ${definition.channel} message=${message.id}`);
  }
}
module.exports = { ensureCommunityCards, definitions, buildCard, WELCOME, matches };
