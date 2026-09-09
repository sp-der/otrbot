const { Pool } = require('pg');
const { createHash } = require('node:crypto');
const SCHEMA = `
CREATE TABLE IF NOT EXISTS ttf_members (
 guild_id text NOT NULL, user_id text NOT NULL, text_xp bigint NOT NULL DEFAULT 0,
 voice_seconds bigint NOT NULL DEFAULT 0, last_message_at timestamptz,
 verified_at timestamptz, joined_at timestamptz, left_at timestamptz,
 tiers jsonb NOT NULL DEFAULT '[]', PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS ttf_awards (
 guild_id text NOT NULL, event_id text NOT NULL, user_id text NOT NULL,
 kind text NOT NULL, fingerprint text, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_id,event_id));
CREATE INDEX IF NOT EXISTS ttf_awards_recent ON ttf_awards(guild_id,user_id,created_at);
CREATE TABLE IF NOT EXISTS ttf_verifications (
 guild_id text NOT NULL, user_id text NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_id,user_id));`;
const total = row => Number(row.text_xp) + Math.floor(Number(row.voice_seconds) / 60) * 5;
class XpStore {
 constructor(pool) { this.pool = pool || new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 10000 }); this.pool.on?.('error',e=>console.error('[xp] database pool error',e.code||e.name)); }
 async init() { await this.pool.query(SCHEMA); }
 async member(g,u) {
  await this.pool.query('INSERT INTO ttf_members(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[g,u]);
  return (await this.pool.query('SELECT * FROM ttf_members WHERE guild_id=$1 AND user_id=$2',[g,u])).rows[0];
 }
 async record(member, verified=false, left=false) {
  const tiers=member.roles.cache.filter(r=>['🥉 Essential','🥇 Premium','👑 Personal Guide'].includes(r.name)).map(r=>r.name);
  await this.pool.query(`INSERT INTO ttf_members(guild_id,user_id,joined_at,left_at,tiers,verified_at)
   VALUES($1,$2,$3,CASE WHEN $4 THEN now() ELSE NULL END,$5,CASE WHEN $6 THEN now() ELSE NULL END)
   ON CONFLICT(guild_id,user_id) DO UPDATE SET joined_at=COALESCE(EXCLUDED.joined_at,ttf_members.joined_at),
   left_at=EXCLUDED.left_at,tiers=EXCLUDED.tiers,verified_at=COALESCE(ttf_members.verified_at,EXCLUDED.verified_at)`,
   [member.guild.id,member.id,member.joinedAt||null,left,JSON.stringify(tiers),verified]);
  if(verified) await this.pool.query('INSERT INTO ttf_verifications(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[member.guild.id,member.id]);
 }
 async award(g,u,event,kind,value,content='') {
  const client=await this.pool.connect();
  try {
   await client.query('BEGIN');
   await client.query('INSERT INTO ttf_members(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[g,u]);
   const row=(await client.query('SELECT * FROM ttf_members WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[g,u])).rows[0];
   const hash=kind==='text'?createHash('sha256').update(content).digest('hex'):null;
   if(kind==='text') {
    const blocked=await client.query(`SELECT 1 WHERE $3::timestamptz > now()-interval '60 seconds'
     OR EXISTS(SELECT 1 FROM ttf_awards WHERE guild_id=$1 AND user_id=$2 AND fingerprint=$4 AND created_at>now()-interval '10 minutes')`,[g,u,row.last_message_at,hash]);
    if(blocked.rowCount){await client.query('COMMIT');return null;}
   }
   const claim=await client.query('INSERT INTO ttf_awards(guild_id,event_id,user_id,kind,fingerprint) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING event_id',[g,event,u,kind,hash]);
   if(!claim.rowCount){await client.query('COMMIT');return null;}
   const result=await client.query(kind==='text'
    ?'UPDATE ttf_members SET text_xp=text_xp+15,last_message_at=now() WHERE guild_id=$1 AND user_id=$2 RETURNING *'
    :'UPDATE ttf_members SET voice_seconds=voice_seconds+$3 WHERE guild_id=$1 AND user_id=$2 RETURNING *',kind==='text'?[g,u]:[g,u,Math.max(0,Math.min(90,Math.floor(value)))]);
   await client.query('COMMIT'); return result.rows[0];
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
 }
 async rank(g,u){const row=await this.member(g,u);const count=await this.pool.query(`SELECT count(*) FROM ttf_members WHERE guild_id=$1 AND verified_at IS NOT NULL AND left_at IS NULL AND text_xp+(voice_seconds/60)*5 > $2`,[g,total(row)]);return {...row,rank:Number(count.rows[0].count)+1};}
 async leaderboard(g,mode='combined'){
  const order={combined:'text_xp+(voice_seconds/60)*5',text:'text_xp',voice:'voice_seconds'}[mode]||'text_xp+(voice_seconds/60)*5';
  return (await this.pool.query(`SELECT * FROM ttf_members WHERE guild_id=$1 AND verified_at IS NOT NULL AND left_at IS NULL ORDER BY ${order} DESC,user_id LIMIT 10`,[g])).rows;
 }
}
module.exports={XpStore,SCHEMA,total};
