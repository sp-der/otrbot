const { Collection } = require('discord.js');
const TIERS = ['🥉 Essential', '🥇 Premium', '👑 Personal Guide'];
const FOUNDATION_ROLE = '🎟️ Foundation Member';
const pending = new Map();

function hasPaidTier(member) {
  return member.roles.cache.some(role => TIERS.includes(role.name));
}

async function syncFoundationMember(member) {
  if (member.user.bot) return;
  const key = `${member.guild.id}:${member.id}`;
  const previous = pending.get(key) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const current = await member.guild.members.fetch({ user: member.id, force: true });
    const role = member.guild.roles.cache.find(r => r.name === FOUNDATION_ROLE);
    if (!role) return;
    const paid = hasPaidTier(current);
    const assigned = current.roles.cache.has(role.id);
    if (paid && !assigned) await current.roles.add(role, 'Paid tier grants shared Foundation access');
    if (!paid && assigned) await current.roles.remove(role, 'No active paid tier remains');
  });
  pending.set(key, task);
  try { await task; } finally { if (pending.get(key) === task) pending.delete(key); }
}

async function loadGuildMembers(guild) {
  const members = new Collection();
  let after;
  do {
    const page = await guild.members.list({ limit: 1000, ...(after ? { after } : {}) });
    for (const [id, member] of page) members.set(id, member);
    if (page.size < 1000) break;
    after = page.lastKey();
  } while (after);
  return members;
}

async function syncAllFoundationMembers(guild) {
  // REST pagination handles rate limits without a second gateway member request.
  const members = await loadGuildMembers(guild);
  for (const member of members.values()) await syncFoundationMember(member);
  console.log('[membership] verified shared Foundation roles against paid tiers');
}

async function postMemberActivity(member, joined) {
  if (member.user.bot) return;
  const channel = member.guild.channels.cache.find(c => c.name === '👥・member-activity' && c.isTextBased());
  if (!channel) return;
  await channel.send({
    content: `<@${member.id}> ${joined ? 'joined The Trading Foundation.' : 'left The Trading Foundation.'}`,
    allowedMentions: { parse: [] },
  });
}
module.exports = { loadGuildMembers, hasPaidTier, syncFoundationMember, syncAllFoundationMembers, postMemberActivity };
