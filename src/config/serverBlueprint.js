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
  { key: 'private', name: '👑 Foundation Private', color: COLORS.gold, hoist: true },
  { key: 'advanced', name: '🥇 Foundation Advanced', color: COLORS.champagne, hoist: true },
  { key: 'live', name: '🥈 Foundation Live', color: COLORS.silver, hoist: true },
  { key: 'essentials', name: '🥉 Foundation Essentials', color: COLORS.green, hoist: true },
  { key: 'member', name: '✅ Member', color: COLORS.navy, hoist: false },
  { key: 'student', name: '📘 Student', color: COLORS.silver, hoist: false },
  { key: 'developing', name: '📗 Developing Trader', color: COLORS.green, hoist: false },
  { key: 'disciplined', name: '📙 Disciplined Trader', color: COLORS.champagne, hoist: false },
  { key: 'veteran', name: '🏆 Foundation Veteran', color: COLORS.gold, hoist: false },
];

const access = {
  public: [],
  essentials: ['essentials', 'live', 'advanced', 'private'],
  live: ['live', 'advanced', 'private'],
  advanced: ['advanced', 'private'],
  private: ['private'],
};

const channels = [
  {
    category: '━━ START HERE ━━',
    access: 'public',
    children: [
      ['👋・welcome', 'Welcome to The Trading Foundation. Start here before entering the community.'],
      ['📜・rules', 'Community rules, trading disclaimer, and member expectations.'],
      ['🧭・getting-started', 'How to use the server, courses, live rooms, and paid access.'],
      ['📢・announcements', 'Official announcements from Dontradez and The Trading Foundation.'],
      ['🎓・choose-your-foundation', 'Compare Foundation Essentials, Live, Advanced, and Private access.'],
      ['❓・faq', 'Frequently asked questions about the community, courses, and access.'],
    ],
  },
  {
    category: '━━ THE FOUNDATION ━━',
    access: 'public',
    children: [
      ['💬・community', 'General market and community conversation.'],
      ['👋・introductions', 'Introduce yourself, your experience level, and what you want to improve.'],
      ['🏆・member-wins', 'Share milestones, disciplined execution, and progress.'],
      ['🧠・trading-mindset', 'Psychology, discipline, process, and consistency.'],
    ],
  },
  {
    category: '━━ FOUNDATION ESSENTIALS ━━',
    access: 'essentials',
    children: [
      ['📚・course-guide', 'Course roadmap and recommended lesson order for Foundation Essentials.'],
      ['❓・student-questions', 'Ask questions about the Essentials curriculum and trading foundations.'],
      ['📓・trade-journals', 'Document trades, process, mistakes, and lessons learned.'],
      ['📊・chart-review', 'Post charts for educational review and structured feedback.'],
    ],
  },
  {
    category: '━━ FOUNDATION LIVE ━━',
    access: 'live',
    children: [
      ['🌅・daily-bias', 'Dontradez market outlook, areas of interest, and educational daily bias.'],
      ['🔴・live-trading', 'Live-session notices, session discussion, and live-trading context.'],
      ['📈・trade-breakdowns', 'Educational breakdowns of entries, exits, invalidation, and execution.'],
      ['🌙・market-recaps', 'Post-session recaps: what happened, what changed, and what was learned.'],
      ['📅・economic-calendar', 'High-impact economic events and session planning reminders.'],
      { name: '🔊 Live Trading', type: ChannelType.GuildVoice, topic: 'Voice room for scheduled live trading sessions.' },
      { name: '🔊 Study Room', type: ChannelType.GuildVoice, topic: 'Voice room for study, chart review, and community sessions.' },
    ],
  },
  {
    category: '━━ FOUNDATION ADVANCED ━━',
    access: 'advanced',
    children: [
      ['🎯・advanced-analysis', 'Higher-level market analysis and execution concepts.'],
      ['💰・risk-management', 'Account-specific risk structure, position sizing, TP, SL, and break-even planning.'],
      ['🏦・prop-firms', 'Educational discussion around evaluations, account sizes, rules, and payouts.'],
      ['📈・scaling', 'Scaling process, account growth, and maintaining consistency as size changes.'],
      ['🧠・consistency', 'Breaking the pass/fail cycle and building repeatable trading habits.'],
      ['📓・advanced-journals', 'Advanced journaling, performance review, and process analysis.'],
    ],
  },
  {
    category: '━━ FOUNDATION PRIVATE ━━',
    access: 'private',
    children: [
      ['🔒・private-members', 'Private mentorship discussion for Foundation Private members.'],
      ['🎫・book-a-session', 'Private session booking instructions and mentorship scheduling.'],
    ],
  },
  {
    category: '━━ COMMUNITY ━━',
    access: 'public',
    children: [
      ['💬・general', 'General community conversation outside the structured trading rooms.'],
      ['🏆・wins', 'Celebrate progress, good process, and community achievements.'],
      ['📸・charts', 'Casual chart sharing and market discussion.'],
      ['🎮・off-topic', 'Non-trading conversation and community hangout.'],
    ],
  },
  {
    category: '━━ SUPPORT ━━',
    access: 'public',
    children: [
      ['🎫・support', 'Access, account, Discord, and Whop support.'],
      ['💡・suggestions', 'Ideas and feedback for improving The Trading Foundation.'],
    ],
  },
];

function textChannel(name, topic) {
  return { name, topic, type: ChannelType.GuildText };
}

for (const group of channels) {
  group.children = group.children.map((item) => {
    if (Array.isArray(item)) return textChannel(item[0], item[1]);
    return item;
  });
}

module.exports = {
  roles,
  access,
  channels,
  permissions: {
    privateCategoryBase: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
    ],
  },
};
