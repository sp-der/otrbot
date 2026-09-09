const {test}=require('node:test');const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {Collection}=require('discord.js');
const {XpStore,SCHEMA,total}=require('../src/services/xpStore');
const {progression,meaningful,eligibleVoice,rankImage}=require('../src/services/activity');
test('Postgres awards are durable, idempotent, and enforce text cooldown and duplicate filtering',async()=>{
 const db=new PGlite();await db.exec(SCHEMA);
 const query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
 const store=new XpStore({query,connect:async()=>({query,release(){}})});
 let row=await store.award('g','u','m1','text',15,'a useful market discussion');assert.equal(Number(row.text_xp),15);
 assert.equal(await store.award('g','u','m2','text',15,'another useful conversation'),null);
 await query("UPDATE ttf_members SET last_message_at=now()-interval '61 seconds'");
 assert.equal(await store.award('g','u','m3','text',15,'a useful market discussion'),null);
 row=await store.award('g','u','m4','text',15,'another useful conversation');assert.equal(Number(row.text_xp),30);
 row=await store.award('g','u','v1','voice',60);assert.equal(total(row),35);
 assert.equal(await store.award('g','u','v1','voice',60),null);
 const restarted=new XpStore({query});assert.equal(total(await restarted.member('g','u')),35);
 await query("UPDATE ttf_members SET verified_at=now()");assert.equal((await store.leaderboard('g')).length,1);
 assert.equal((await store.rank('g','u')).rank,1);await db.close();
});
test('message filter and rank thresholds',()=>{
 assert.equal(meaningful('a a a a a'),false);assert.equal(meaningful('https://example.com'),false);
 assert.equal(meaningful('Thank you for explaining market structure'),true);
 assert.equal(progression(0).role,'🌱 New Trader');assert.equal(progression(2500).role,'📘 Student');
 assert.equal(progression(250000).role,'🐅 Foundation Elite');
});
test('voice needs two verified non-deafened humans and excludes AFK',()=>{
 const member=id=>({id,user:{bot:false},roles:{cache:new Collection([['v',{name:'✅ Community Member'}]])},voice:{selfDeaf:false,serverDeaf:false}});
 const one=member('1'),two=member('2'),channel={id:'c',isVoiceBased:()=>true,members:new Collection([['1',one]])};
 const guild={afkChannelId:'afk',channels:{cache:new Collection([['c',channel]])}};
 assert.equal(eligibleVoice(guild).size,0);channel.members.set('2',two);assert.equal(eligibleVoice(guild).size,2);
 two.voice.selfDeaf=true;assert.equal(eligibleVoice(guild).size,0);two.voice.selfDeaf=false;guild.afkChannelId='c';assert.equal(eligibleVoice(guild).size,0);
});
test('rank image renders as a PNG without external avatar availability',async()=>{
 const file=await rankImage({displayName:'Test Member',user:{displayAvatarURL:()=> 'invalid-url'}},{text_xp:150,voice_seconds:120,rank:2});
 assert.equal(file.attachment.readUInt32BE(0),0x89504e47);
});
