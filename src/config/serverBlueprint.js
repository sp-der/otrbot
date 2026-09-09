const { ChannelType, PermissionFlagsBits } = require('discord.js');

const COLORS = {
  gold: 0xd4af37,
  champagne: 0xe5c56e,
  navy: 0x0b1b33,
  silver: 0xc8ccd4,
  green: 0x4f9d69,
};

const roles = [
  { key: 'dontradez', name: '👑 Dontradez', color: COLORS.gold, hoist: true },
  { key: 'admin', name: '🛡️ Admin', color: COLORS.champagne, hoist: true },
  { key: 'moderator', name: '🔨 Moderator', color: COLORS.silver, hoist: true },
  { key: 'personal', name: '👑 Personal Guide', aliases: ['👑 Foundation Private'], color: COLORS.gold, hoist: true },
  { key: 'premium', name: '🥇 Premium', aliases: ['🥇 Foundation Advanced'], color: COLORS.champagne, hoist: true },
  { key: 'essential', name: '🥉 Essential', aliases: ['🥉 Foundation Essentials'], color: COLORS.green, hoist: true },
  { key: 'foundationMember', name: '🎟️ Foundation Member', color: COLORS.silver, hoist: false },
  { key: 'member', name: '✅ Community Member', aliases: ['✅ Member'], color: COLORS.navy, hoist: false },
  { key: 'elite', name: '🐅 Foundation Elite', color: COLORS.gold, hoist: false },
  { key: 'veteran', name: '🏆 Foundation Veteran', color: COLORS.gold, hoist: false },
  { key: 'foundation', name: '🎓 Foundation Trader', color: COLORS.champagne, hoist: false },
  { key: 'disciplined', name: '📙 Disciplined Trader', color: COLORS.champagne, hoist: false },
  { key: 'developing', name: '📗 Developing Trader', color: COLORS.green, hoist: false },
  { key: 'student', name: '📘 Student', color: COLORS.silver, hoist: false },
  { key: 'new', name: '🌱 New Trader', color: COLORS.silver, hoist: false },
];

const access = {
  public: [],
  staff: [],
  member: ['member'],
  foundation: ['foundationMember', 'essential', 'premium', 'personal'],
  essential: ['essential', 'premium', 'personal'],
  premium: ['premium', 'personal'],
  personal: ['personal'],
};

const text = (name, topic, mode = 'chat', aliases = []) => ({ name, topic, mode, aliases, type: ChannelType.GuildText });
const voice = (name, mode = 'chat', aliases = []) => ({ name, mode, aliases, type: ChannelType.GuildVoice });
const channels = [
  { category: '━━ START HERE ━━', access: 'public', children: [
    text('👋・welcome', 'Your introduction to The Trading Foundation. Review the rules to enter the community.', 'readonly'),
    text('📜・rules', 'Read and accept the rules to unlock the free Community section.', 'readonly'),
    text('📢・announcements', 'Official updates from Dontradez and The Trading Foundation.', 'readonly'),
    text('🎓・choose-your-foundation', 'Essential $50 • Premium $100 • Personal Guide $150. Compare what is included.', 'readonly'),
    text('❓・faq', 'Answers about courses, community access, upgrades, and live teaching.', 'readonly'),
  ] },
  { category: '━━ MEMBER ACTIVITY ━━', access: 'member', children: [
    text('👥・member-activity', 'Member joins and departures.', 'readonly'),
  ] },
  { category: '━━ COMMUNITY ━━', access: 'member', children: [
    text('💬・general', 'Free community conversation for everyone who has accepted the rules.'),
    text('👋・introductions', 'Introduce yourself and what you want to learn.'),
    text('🏆・wins', 'Celebrate progress and disciplined execution.'),
    text('📸・charts', 'Share charts and discuss the markets with the community.'),
    text('🧠・trading-mindset', 'Discipline, patience, and consistency.'),
    text('🎮・off-topic', 'Community hangout and non-trading conversation.'),
  ] },
  { category: '━━ THE FOUNDATION ━━', access: 'foundation', children: [
    text('💬・foundation-chat', 'Shared discussion for Essential, Premium, and Personal Guide members.', 'chat', ['💬・community']),
    text('🏆・foundation-wins', 'Share progress with fellow Foundation members.', 'chat', ['🏆・member-wins']),
    text('❓・student-questions', 'Questions about the basic lessons and trading foundations.'),
    text('📓・trade-journals', 'Document your process, mistakes, and lessons learned.'),
    text('📊・chart-review', 'Share charts for member discussion. Guided daily reviews are in Personal Guide.'),
  ] },
  { category: '━━ ESSENTIAL COURSES ━━', aliases: ['━━ FOUNDATION ESSENTIALS ━━'], access: 'essential', children: [
    text('📚・course-guide', 'The roadmap for Don’s 10 basic videos. Lessons will be available on Discord and Whop.', 'readonly'),
    text('🎬・basic-videos', 'Don’s 10 basic trading lessons. Staff will publish the videos here.', 'readonly'),
  ] },
  { category: '━━ PREMIUM COURSES ━━', aliases: ['━━ FOUNDATION ADVANCED ━━'], access: 'premium', children: [
    text('🎬・dons-strategy', 'Don’s advanced strategy and trading journey videos, also available on Whop.', 'readonly'),
    text('🎯・bubbas-ote', 'Bubba’s OTE and strategy videos, also available on Whop.', 'readonly'),
    text('❓・strategy-questions', 'Questions about Don’s advanced strategy and journey.'),
    text('❓・bubbas-questions', 'Questions about Bubba’s OTE lessons and strategy.'),
    text('🎯・advanced-analysis', 'Discuss advanced market structure and execution concepts.'),
    text('💰・risk-management', 'Discuss risk planning and position sizing.'),
    text('🏦・prop-firms', 'Educational discussion of evaluations and account rules.'),
    text('📈・scaling', 'Discuss process and consistency as account size changes.'),
    text('🧠・consistency', 'Develop repeatable trading habits.'),
    text('📓・advanced-journals', 'Performance review and process analysis.'),
  ] },
  { category: '━━ PREMIUM DISCUSSION ━━', aliases: ['━━ FOUNDATION LIVE ━━'], access: 'premium', children: [
    text('🌅・daily-bias', 'Educational market outlook and areas of interest.', 'readonly'),
    text('📈・trade-breakdowns', 'Staff breakdowns of trade structure and execution.', 'readonly'),
    text('🌙・market-recaps', 'Educational market recaps.', 'readonly'),
    text('📅・economic-calendar', 'Economic events and session planning.', 'readonly'),
    voice('🔊 Study Room'),
  ] },
  { category: '━━ PERSONAL GUIDE ━━', aliases: ['━━ FOUNDATION PRIVATE ━━'], access: 'personal', children: [
    text('📅・course-schedule', 'Schedule for the one-month live course. Dates will be announced here.', 'readonly', ['🎫・book-a-session']),
    text('🔴・live-classroom-chat', 'Live course discussion and questions for Don.', 'chat', ['🔴・live-trading']),
    text('❓・course-questions', 'Questions for Don during your guided course.', 'chat', ['🔒・private-members']),
    text('📥・trade-submissions', 'Submit trades for the daily guided reviews, around 1–2 selected trades per day.'),
    text('📋・daily-trade-reviews', 'Staff reviews of selected member trades during the one-month course.', 'readonly'),
    voice('🔊 Live Classroom', 'listen', ['🔊 Live Trading']),
  ] },
  { category: '━━ SUPPORT ━━', access: 'public', children: [
    text('🎫・support', 'Open a private support ticket using the button below.', 'readonly'),
    text('💡・suggestions', 'Ideas and feedback for The Trading Foundation.'),
  ] },
  { category: '━━ SUPPORT TICKETS ━━', access: 'staff', children: [
    text('💳・whop-activity', 'Private Whop membership, payment, refund, and access-sync activity.', 'readonly'),
  ] },
];

module.exports = { roles, access, channels,
  permissions: { privateCategoryBase: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
};
