const path=require('node:path');
const {AttachmentBuilder,MessageFlags,escapeMarkdown}=require('discord.js');
const {buildCard}=require('./communityCards');
async function postOnboarding(member,joined){
 if(member.user.bot)return;
 const guild=member.guild,channel=guild.channels.cache.find(c=>c.name===(joined?'👋・welcome':'👥・member-activity'));
 if(!channel)return;
 const rules=guild.channels.cache.find(c=>c.name==='📜・rules');
 const tiers=member.roles.cache.filter(r=>['🥉 Essential','🥇 Premium','👑 Personal Guide'].includes(r.name)).map(r=>r.name);
 const name=escapeMarkdown(member.user.username);
 const body=[{type:9,components:[{type:10,content:joined?`Welcome, **${name}**. You’re member **${guild.memberCount}**.\nReview the rules to unlock the community and begin your foundation.`:`**${name}** has left The Trading Foundation.\nJoined: ${member.joinedTimestamp?`<t:${Math.floor(member.joinedTimestamp/1000)}:D>`:'Not recorded'}\nTime in server: ${member.joinedTimestamp?Math.floor((Date.now()-member.joinedTimestamp)/86400000)+' days':'Not recorded'}\nPackage: ${tiers.join(', ')||'Community'}`}],accessory:{type:11,media:{url:member.user.displayAvatarURL({extension:'png',size:128})}}}];
 if(joined&&rules)body.push({type:1,components:[{type:2,style:5,label:'Review & Accept Rules',url:`https://discord.com/channels/${guild.id}/${rules.id}`}]});
 await channel.send({flags:MessageFlags.IsComponentsV2,components:[buildCard({id:106,title:joined?'WELCOME TO THE FOUNDATION':'MEMBER DEPARTURE',body})],files:[new AttachmentBuilder(path.join(__dirname,'../../assets/ttf-rules-header.png'),{name:'ttf-rules-header.png'})],allowedMentions:{parse:[]}});
}
module.exports={postOnboarding};
async function paidWelcome(before,member){
 if(member.user.bot)return;
 const names=['👑 Personal Guide','🥇 Premium','🥉 Essential'];
 const highest=m=>names.find(n=>m.roles.cache.some(r=>r.name===n));
 const tier=highest(member);if(!tier||tier===highest(before))return;
 const channel=member.guild.channels.cache.find(c=>c.name==='💬・foundation-chat');
 const destination=member.guild.channels.cache.find(c=>c.name===(tier==='👑 Personal Guide'?'📅・course-schedule':tier==='🥇 Premium'?'🎬・dons-strategy':'📚・course-guide'));
 if(channel)await channel.send({content:`Welcome to **${tier}**, <@${member.id}>. ${destination?`Start here: <#${destination.id}>.`:'Your Foundation channels are now available.'}`,allowedMentions:{parse:[]}});
}
module.exports.paidWelcome=paidWelcome;
