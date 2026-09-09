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

async function syncAllFoundationMembers(guild) {
  await guild.members.fetch();
  for (const member of guild.members.cache.values()) await syncFoundationMember(member);
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
module.exports = { hasPaidTier, syncFoundationMember, syncAllFoundationMembers, postMemberActivity };
