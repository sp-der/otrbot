const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const blueprint = require('../src/config/serverBlueprint');
const { buildOverwrites, rolePermissions, rebuildOldChannels } = require('../src/services/syncServer');
const roles = new Map(blueprint.roles.map(r => [r.key, { id: r.key }]));
const bits = value => new PermissionsBitField(value || []).bitfield;
function effective(overwrites, keys) {
  let value = bits([P.ViewChannel, P.SendMessages, P.SendMessagesInThreads, P.Speak, P.Stream, P.Connect, P.CreatePrivateThreads]);
  for (const key of keys) value |= bits(rolePermissions(key));
  const everyone = overwrites.find(o => o.id === 'guild');
  value = (value & ~bits(everyone.deny)) | bits(everyone.allow);
  let allow = 0n, deny = 0n;
  for (const o of overwrites.filter(o => keys.includes(o.id))) { allow |= bits(o.allow); deny |= bits(o.deny); }
  return new PermissionsBitField((value & ~deny) | allow);
}
test('every combination of paid tiers and activity ranks respects visibility and posting rules', () => {
  const paid = ['essential', 'premium', 'personal'];
  const ranks = blueprint.roles.map(r => r.key).filter(k => !paid.includes(k) && !['dontradez','admin','moderator'].includes(k));
  for (const group of blueprint.channels) for (const channel of group.children) {
    const overwrites = buildOverwrites({ id: 'guild' }, 'bot', group.access, roles, channel.mode);
    for (let mask = 0; mask < 8; mask++) for (const rank of ranks) {
      const keys = [...paid.filter((_, i) => mask & (1 << i)), rank];
      const p = effective(overwrites, keys);
      const visible = group.access === 'public' || keys.some(k => blueprint.access[group.access].includes(k));
      assert.equal(p.has(P.ViewChannel), visible, `${channel.name}: ${keys}`);
      if (!visible) continue;
      assert.equal(p.has(P.SendMessages), channel.mode !== 'readonly');
      assert.equal(p.has(P.SendMessagesInThreads), channel.mode !== 'readonly');
      assert.equal(p.has(P.Speak), channel.mode !== 'listen');
      assert.equal(p.has(P.Stream), channel.mode !== 'listen');
      assert.equal(p.has(P.MentionEveryone), false);
      assert.equal(p.has(P.CreatePrivateThreads), false);
    }
    for (const key of ['dontradez', 'admin', 'moderator']) {
      const p = effective(overwrites, [key, ...paid]);
      assert.equal(p.has([P.ViewChannel, P.SendMessages, P.Speak, P.Stream]), true);
    }
  }
});
test('rebuild deletes only pre-cutoff channels and safely resumes after interruption', async () => {
  const cache = new Map();
  let fail = true;
  for (const [id, createdTimestamp, type] of [['old-text', 1000, 0], ['old-category', 1000, 4], ['new-text', 3000, 0]]) {
    cache.set(id, { id, name: id, createdTimestamp, type, deletable: true,
      permissionOverwrites: { cache: { toJSON: () => [] } },
      delete: async () => { if (id === 'old-category' && fail) { fail = false; throw new Error('interrupted'); } cache.delete(id); } });
  }
  const guild = { id: '1423037046498263043', features: [], channels: { cache } };
  await assert.rejects(rebuildOldChannels(guild, '1970-01-01T00:00:02Z'), /interrupted/);
  await rebuildOldChannels(guild, '1970-01-01T00:00:02Z');
  await rebuildOldChannels(guild, '1970-01-01T00:00:02Z');
  assert.deepEqual([...cache.keys()], ['new-text']);
  await assert.rejects(rebuildOldChannels({ ...guild, id: 'other' }, '1970-01-01T00:00:02Z'), /Invalid/);
});
