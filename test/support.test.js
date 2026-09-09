const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Collection, ChannelType, PermissionsBitField, PermissionFlagsBits: P, ContainerBuilder } = require('discord.js');
const { ticketOverwrites, reasonModal, ticketPayload, createTicket, closeTicket, handleSupportInteraction } = require('../src/services/supportTickets');
const bits = value => new PermissionsBitField(value || []).bitfield;
const STAFF = ['👑 Dontradez', '🛡️ Admin', '🔨 Moderator'].map((name, i) => ({ id: String(200 + i), name }));
function fixture() {
  let count = 0;
  const category = { id: '400', name: '━━ SUPPORT TICKETS ━━', type: ChannelType.GuildCategory };
  const cache = new Collection([[category.id, category]]);
  const posts = [];
  const guild = { id: '1000', ownerId: '111', channels: { cache,
    fetch: async id => id ? cache.get(id) : cache,
    create: async data => {
      count++;
      const ch = { ...data, id: String(500 + count), parentId: data.parent, parent: category,
        permissionOverwrites: { cache: new Collection() },
        send: async p => { posts.push(p); return { id: 'm' }; },
        edit: async p => { Object.assign(ch, p); ch.permissionOverwrites = {cache: makeOverwrites(p.permissionOverwrites)}; return ch; },
        delete: async () => cache.delete(ch.id),
      };
      ch.permissionOverwrites.cache = makeOverwrites(data.permissionOverwrites);
      cache.set(ch.id, ch); return ch;
    } },
    roles: { cache: new Collection(STAFF.map(r => [r.id, r])), fetch: async () => {} },
    members: { fetch: async ({ user }) => ({ id: user, roles: { cache: new Collection() } }) },
  };
  return { guild, posts, count: () => count };
}
function makeOverwrites(items) {
  return new Collection(items.map(o => [o.id, { ...o, allow: new PermissionsBitField(o.allow), deny: new PermissionsBitField(o.deny) }]));
}
function effective(overwrites, userId, roleIds = []) {
  let result = bits([P.ViewChannel, P.SendMessages]);
  const everyone = overwrites.find(o => o.id === '1000');
  result = (result & ~bits(everyone.deny)) | bits(everyone.allow);
  let allow = 0n, deny = 0n;
  for (const o of overwrites.filter(o => o.type === 0 && roleIds.includes(o.id))) { allow |= bits(o.allow); deny |= bits(o.deny); }
  result = (result & ~deny) | allow;
  const user = overwrites.find(o => o.type === 1 && o.id === userId);
  if (user) result = (result & ~bits(user.deny)) | bits(user.allow);
  return new PermissionsBitField(result);
}
test('tickets are private to the owner, Don, Admin, Moderators and bot', () => {
  const rows = ticketOverwrites({ id: '1000' }, '9000', '123', STAFF);
  assert.equal(effective(rows, '123').has([P.ViewChannel, P.SendMessages]), true);
  assert.equal(effective(rows, '9000').has([P.ViewChannel, P.SendMessages]), true);
  for (const staff of STAFF) assert.equal(effective(rows, 'other', [staff.id]).has([P.ViewChannel, P.SendMessages]), true);
  for (const roles of [[], ['essential'], ['premium'], ['personal'], ['community', 'foundation']]) {
    assert.equal(effective(rows, '456', roles).has(P.ViewChannel), false);
  }
  assert.equal(effective(rows, '123').has(P.MentionEveryone), false);
  assert.equal(effective(rows, '123').has(P.CreatePrivateThreads), false);
});
test('ticket form and maximum-size reason card serialize with banner first', () => {
  const modal = reasonModal().toJSON();
  assert.equal(modal.custom_id, 'support:reason');
  assert.equal(modal.components[0].components[0].required, true);
  const payload = ticketPayload('123', '*'.repeat(1500));
  const card = new ContainerBuilder(payload.components[0]).toJSON();
  assert.equal(card.components[0].type, 12);
  assert.ok(card.components.reduce((n, c) => n + (c.content?.length || 0), 0) < 4000);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
});
test('concurrent submissions and later retries create only one private ticket', async () => {
  const f = fixture();
  const user = { id: '123', bot: false };
  const [one, two] = await Promise.all([
    createTicket(f.guild, user, '9000', 'Course access'),
    createTicket(f.guild, user, '9000', 'Course access'),
  ]);
  assert.equal(one.channel.id, two.channel.id); assert.equal(two.existing, true);
  const retry = await createTicket(f.guild, user, '9000', 'Another click');
  assert.equal(retry.existing, true); assert.equal(f.count(), 1); assert.equal(f.posts.length, 1);
  assert.match(f.posts[0].components[0].components[3].content, /Course access/);
});
test('modal is immediate and private confirmation follows channel creation', async () => {
  const f = fixture();
  let modal, deferred = false, answer;
  const base = { guild: f.guild, channel: {name: '🎫・support'}, user: {id: '123', bot: false} };
  await handleSupportInteraction({ ...base, isButton:()=>true, isModalSubmit:()=>false,
    customId:'support:open', message:{author:{id:'9000'}}, showModal:async m=>{modal=m;} },'9000');
  assert.equal(modal.toJSON().custom_id,'support:reason');
  await handleSupportInteraction({ ...base, isButton:()=>false, isModalSubmit:()=>true,
    customId:'support:reason',fields:{getTextInputValue:()=> 'Need help'},
    deferReply:async opts=>{assert.equal(opts.flags,64);deferred=true;},
    editReply:async p=>{assert.ok(deferred);assert.equal(f.count(),1);answer=p.content;},
  },'9000');
  assert.match(answer,/Your ticket is now open/); assert.match(answer,/<#501>/);
});
test('only staff close tickets; closing preserves messages and permits a new ticket', async () => {
  const f=fixture();
  const {channel}=await createTicket(f.guild,{id:'123',bot:false},'9000','Help');
  const replies=[];
  const interaction={guild:f.guild,channel,user:{id:'123'},editReply:async s=>replies.push(s)};
  await closeTicket(interaction,'9000');
  assert.match(channel.topic,/:open$/); assert.match(replies[0],/Only Don/);
  f.guild.members.fetch=async()=>({id:'2000',roles:{cache:new Collection([[STAFF[1].id,STAFF[1]]])}});
  interaction.user.id='2000'; await closeTicket(interaction,'9000');
  assert.ok(f.guild.channels.cache.has(channel.id)); assert.match(channel.topic,/:closed$/);
  const rows=Array.from(channel.permissionOverwrites.cache.values()).map(o=>({...o,allow:o.allow.bitfield,deny:o.deny.bitfield}));
  assert.equal(effective(rows,'123').has(P.ViewChannel),true);
  assert.equal(effective(rows,'123').has(P.SendMessages),false);
  const fresh=await createTicket(f.guild,{id:'123',bot:false},'9000','A new issue');
  assert.notEqual(fresh.channel.id,channel.id);
});
test('failed initial message rolls back the freshly-created ticket', async () => {
  const f=fixture();
  const create=f.guild.channels.create;
  f.guild.channels.create=async data=>{const ch=await create(data);ch.send=async()=>{throw new Error('send failed');};return ch;};
  await assert.rejects(createTicket(f.guild,{id:'123',bot:false},'9000','Help'),/send failed/);
  assert.equal(f.guild.channels.cache.size,1);
});

test('member ticket card has no close button and legacy cleanup preserves other content', () => {
  const { hasCloseButton, withoutCloseButtons } = require('../src/services/supportTickets');
  const card = ticketPayload('123','Help').components;
  assert.equal(hasCloseButton(card),false);
  const legacy = structuredClone(card);
  legacy[0].components.push({type:1,components:[{type:2,custom_id:'support:close',label:'Close'}]});
  assert.equal(hasCloseButton(legacy),true);
  assert.deepEqual(withoutCloseButtons(legacy),card);
});

test('staff command shows an ephemeral button, but members receive no controls', async () => {
  const f=fixture();
  const {channel}=await createTicket(f.guild,{id:'123',bot:false},'9000','Help');
  let reply, flags;
  const interaction={guild:f.guild,channel,user:{id:'123'},commandName:'ticket-controls',
    isChatInputCommand:()=>true, deferReply:async o=>{flags=o.flags;},editReply:async p=>{reply=p;}};
  await handleSupportInteraction(interaction,'9000');
  assert.equal(flags,64);assert.equal(typeof reply,'string');assert.match(reply,/only available/);
  f.guild.members.fetch=async()=>({id:'2000',roles:{cache:new Collection([[STAFF[1].id,STAFF[1]]])}});
  interaction.user.id='2000'; await handleSupportInteraction(interaction,'9000');
  assert.equal(flags,64);assert.equal(reply.components[0].components[0].custom_id,'support:close');
});

test('existing ticket messages lose shared close controls during startup', async () => {
  const { removeSharedCloseControls,hasCloseButton }=require('../src/services/supportTickets');
  const f=fixture();const {channel}=await createTicket(f.guild,{id:'123',bot:false},'9000','Help');
  const msg={id:'m1',author:{id:'9000'},components:ticketPayload('123','Help').components,
    edit:async p=>{msg.components=p.components;return msg;}};
  msg.components[0].components.push({type:1,components:[{type:2,custom_id:'support:close'}]});
  channel.messages={fetch:async opts=>opts.message?msg:new Collection([['m1',msg]])};
  await removeSharedCloseControls(f.guild,'9000');
  assert.equal(hasCloseButton(msg.components),false);
  assert.equal(msg.components[0].components[0].type,12);
});
