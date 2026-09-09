const { randomUUID } = require('node:crypto');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { XpStore,total } = require('./xpStore');
const RANKS=[[0,'🌱 New Trader'],[5,'📘 Student'],[10,'📗 Developing Trader'],[20,'📙 Disciplined Trader'],[30,'🎓 Foundation Trader'],[40,'🏆 Foundation Veteran'],[50,'🐅 Foundation Elite']];
const threshold=level=>100*level*level;
function progression(xp){const level=Math.floor(Math.sqrt(xp/100));return {level,start:threshold(level),next:threshold(level+1),role:[...RANKS].reverse().find(([l])=>level>=l)[1]};}
function normalizedMessage(content){return content.toLowerCase().replace(/https?:\/\/\S+|<[^>]+>/g,' ').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();}
function meaningful(content){const s=normalizedMessage(content);return s.length>=15&&new Set(s.split(' ')).size>=3;}
const verified=m=>!m.user.bot&&m.roles.cache.some(r=>r.name==='✅ Community Member');
function eligibleVoice(guild){
 const result=new Map();
 for(const channel of guild.channels.cache.values()){
  if(!channel.isVoiceBased?.()||channel.id===guild.afkChannelId)continue;
  const members=[...channel.members.values()].filter(m=>verified(m)&&!m.voice.selfDeaf&&!m.voice.serverDeaf);
  if(members.length<2)continue;
  for(const m of members)result.set(m.id,m);
 }return result;
}
async function rankImage(member,row){
 const xp=total(row),p=progression(xp),c=createCanvas(1000,320),ctx=c.getContext('2d');
 ctx.fillStyle='#07192c';ctx.fillRect(0,0,1000,320);ctx.fillStyle='#d4af37';ctx.fillRect(0,0,1000,7);
 ctx.fillStyle='#d4af37';ctx.font='20px sans-serif';ctx.fillText('THE TRADING FOUNDATION',36,45);
 ctx.fillStyle='#ffffff';ctx.font='bold 34px sans-serif';ctx.fillText(member.displayName.slice(0,30),36,103);
 ctx.font='22px sans-serif';ctx.fillStyle='#c8ccd4';ctx.fillText(`LEVEL ${p.level}   •   SERVER RANK #${row.rank}`,36,143);
 ctx.font='18px sans-serif';ctx.fillText(`${xp.toLocaleString()} XP  •  ${Math.floor(Number(row.voice_seconds)/60)} voice minutes`,36,184);
 ctx.fillStyle='#24384b';ctx.fillRect(36,218,740,18);ctx.fillStyle='#d4af37';ctx.fillRect(36,218,740*(xp-p.start)/(p.next-p.start),18);
 ctx.fillStyle='#c8ccd4';ctx.fillText(`${p.next-xp} XP to level ${p.level+1}`,36,269);
 try {const response=await fetch(member.user.displayAvatarURL({extension:'png',size:128}),{signal:AbortSignal.timeout(5000)});if(response.ok){const avatar=await loadImage(Buffer.from(await response.arrayBuffer()));ctx.save();ctx.beginPath();ctx.arc(885,150,72,0,Math.PI*2);ctx.clip();ctx.drawImage(avatar,813,78,144,144);ctx.restore();}}catch{}
 return new AttachmentBuilder(await c.encode('png'),{name:'foundation-rank.png'});
}
class Activity {
 constructor(client,guild){this.client=client;this.guild=guild;this.store=new XpStore();this.voice=new Map();this.session=randomUUID();this.busy=false;this.roles=new Map();}
 async init(){await this.store.init();for(const member of this.guild.members.cache.values())if(!member.user.bot){await this.store.record(member,verified(member));if(verified(member))await this.syncRank(member,await this.store.member(this.guild.id,member.id));}
  this.voice= new Map([...eligibleVoice(this.guild)].map(([id,m])=>[id,{member:m,at:Date.now()}]));
  this.timer=setInterval(()=>this.tick().catch(e=>console.error('[xp] voice tick failed',e.code||e.name)),30000);this.timer.unref();console.log('[xp] Postgres ready; message/voice XP and rank commands active');}
 async syncRank(member,row){const desired=progression(total(row)).role;const target=this.guild.roles.cache.find(r=>r.name===desired);if(!target)return;
  const key=member.id;if(this.roles.has(key))return;this.roles.set(key,true);
  try{if(!member.roles.cache.has(target.id))await member.roles.add(target,'Activity progression');const old=member.roles.cache.filter(r=>RANKS.some(([,n])=>n===r.name)&&r.id!==target.id);if(old.size)await member.roles.remove(old,'Activity progression');}finally{this.roles.delete(key);}}
 async onMessage(message){if(message.guildId!==this.guild.id||message.author.bot||message.webhookId||!message.member||!verified(message.member))return;
  const category=message.channel.parent?.name;
  if(!['━━ COMMUNITY ━━','━━ THE FOUNDATION ━━','━━ PREMIUM COURSES ━━','━━ PREMIUM DISCUSSION ━━','━━ PERSONAL GUIDE ━━'].includes(category)||message.channel.name==='👥・member-activity'||!meaningful(message.content))return;
  const row=await this.store.award(this.guild.id,message.author.id,`message:${message.id}`,'text',15,normalizedMessage(message.content));if(row)await this.syncRank(message.member,row);
 }
 async tick(){if(this.busy){this.pendingTick=true;return;}this.busy=true;try{const now=Date.now(),next=this.client.isReady()?eligibleVoice(this.guild):new Map();
  const previous=this.voice;this.voice=new Map([...next].map(([id,member])=>[id,{member,at:now}]));
  for(const [id,entry]of previous){const seconds=Math.min(90,Math.floor((now-entry.at)/1000));if(seconds>0){const row=await this.store.award(this.guild.id,id,`voice:${this.session}:${id}:${now}`,'voice',seconds);if(row)await this.syncRank(entry.member,row).catch(e=>console.error('[xp] rank sync failed',e.code||e.name));}}
 }finally{this.busy=false;if(this.pendingTick){this.pendingTick=false;await this.tick();}}}
 async onMember(member){await this.store.record(member,verified(member));if(verified(member))await this.syncRank(member,await this.store.member(this.guild.id,member.id));}
 async command(i){await i.deferReply();if(i.commandName==='rank'){const user=i.options.getUser('member')||i.user;const member=await this.guild.members.fetch(user.id);if(!verified(member)){await i.editReply('Ranks are available after accepting the server rules.');return;}const row=await this.store.rank(this.guild.id,user.id);await i.editReply({files:[await rankImage(member,row)]});return;}
  const mode=i.options.getString('view')||'combined',rows=await this.store.leaderboard(this.guild.id,mode);const description=rows.length?rows.map((r,n)=>`**${n+1}.** <@${r.user_id}> — ${mode==='voice'?`${Math.floor(Number(r.voice_seconds)/60)} minutes`: `${mode==='text'?r.text_xp:total(r)} XP`}`).join('\n'):'Be the first to earn XP through conversation and voice activity.';
  await i.editReply({embeds:[new EmbedBuilder().setColor(0xd4af37).setTitle(`THE FOUNDATION • ${mode.toUpperCase()} LEADERBOARD`).setDescription(description)],allowedMentions:{parse:[]}});
 }
}
module.exports={Activity,progression,threshold,meaningful,normalizedMessage,eligibleVoice,rankImage};
