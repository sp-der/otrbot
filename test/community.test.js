const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Collection, ContainerBuilder } = require('discord.js');
const { buildCard, definitions, WELCOME, ensureCommunityCards } = require('../src/services/communityCards');
const { syncFoundationMember, postMemberActivity } = require('../src/services/membership');
const { handleRulesReaction } = require('../src/services/rulesGate');

test('branded cards fit Discord limits, have the header first, and welcome links to rules', () => {
  const guild = { id: '123', channels: { cache: new Collection([
    ['rules', { name: '📜・rules', id: '456' }],
    ['tiers', { name: '🎓・choose-your-foundation', id: '789' }],
  ]) } };
  for (const def of definitions(guild)) {
    const card = new ContainerBuilder(buildCard(def)).toJSON();
    assert.equal(card.components[0].type, 12);
    assert.equal(card.components[0].items[0].media.url, 'attachment://ttf-rules-header.png');
    assert.ok(card.components.reduce((n, c) => n + (c.content?.length || 0), 0) <= 4000);
    assert.ok(card.components.length < 40);
    for (const c of card.components.filter(c => c.type === 10)) assert.ok(c.content.length <= 4000);
    if (def.id === 101) {
      assert.equal(card.components[2].content, WELCOME);
      assert.equal(card.components[3].components[0].url, 'https://discord.com/channels/123/456');
      assert.equal(card.components[3].components[0].label, 'Review & Accept the Rules');
    }
    if (def.id === 102) assert.equal(card.components.some(c => c.type === 1), false);
  }
});

test('repeated card publishing edits existing messages without duplicate posts', async () => {
  let sends = 0, edits = 0;
  const channels = new Collection();
  for (const name of ['📜・rules', '👋・welcome', '🎓・choose-your-foundation', '❓・faq']) {
    const messages = new Collection();
    const channel = { name, id: String(channels.size + 1), isTextBased: () => true,
      messages: { fetch: async opts => opts.message ? messages.get(opts.message) : messages },
      send: async payload => {
        sends++;
        const message = { id: `m${sends}`, author: { id: 'bot' }, components: payload.components,
          edit: async p => { edits++; message.components = p.components; return message; } };
        messages.set(message.id, message); return message;
      } };
    channels.set(channel.id, channel);
  }
  const guild = { id: 'guild', channels: { fetch: async () => {}, cache: channels } };
  await ensureCommunityCards(guild, 'bot');
  await ensureCommunityCards(guild, 'bot');
  assert.equal(sends, 3); assert.equal(edits, 3);
});

test('Foundation membership follows tier grants, downgrades, and last-tier removal', async () => {
  const foundation = { id: 'f', name: '🎟️ Foundation Member' };
  const premium = { id: 'p', name: '🥇 Premium' };
  const essential = { id: 'e', name: '🥉 Essential' };
  const cache = new Collection([['p', premium]]);
  const member = { id: 'u', user: { bot: false }, roles: { cache,
    add: async r => cache.set(r.id, r), remove: async r => cache.delete(r.id) } };
  member.guild = { id: 'g', roles: { cache: new Collection([['f', foundation]]) }, members: { fetch: async () => member } };
  await syncFoundationMember(member); assert.ok(cache.has('f'));
  cache.delete('p'); cache.set('e', essential);
  await syncFoundationMember(member); assert.ok(cache.has('f'));
  cache.delete('e'); await syncFoundationMember(member); assert.equal(cache.has('f'), false);
});

test('rules acceptance grants only Community Member, never paid course access', async () => {
  let granted;
  const role = { id: 'community', name: '✅ Community Member' };
  const guild = { roles: { cache: new Collection([[role.id, role]]) },
    members: { fetch: async () => ({ roles: { cache: new Collection(), add: async r => { granted = r; } } }) } };
  const message = { author: { id: 'bot' }, guild, channel: { name: '📜・rules' },
    components: [{ type: 17, components: [{ type: 10, content: '## 📜 SERVER RULES\nWelcome' }] }] };
  await handleRulesReaction({ emoji: { name: '✅' }, message }, { id: 'u', bot: false }, 'bot');
  assert.equal(granted.id, 'community');
});

test('join/leave events are posted only to member activity without notifications', async () => {
  const posts = [];
  const guild = { channels: { cache: new Collection([
    ['welcome', { name: '👋・welcome', isTextBased: () => true, send: () => { throw new Error('wrong channel'); } }],
    ['activity', { name: '👥・member-activity', isTextBased: () => true, send: async p => posts.push(p) }],
  ]) } };
  const member = { id: 'u', user: { bot: false }, guild };
  await postMemberActivity(member, true); await postMemberActivity(member, false);
  assert.equal(posts.length, 2); assert.match(posts[0].content, /joined/); assert.match(posts[1].content, /left/);
  assert.deepEqual(posts[0].allowedMentions, { parse: [] });
});
