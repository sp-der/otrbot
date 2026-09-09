const { Pool } = require('pg');

const WHOP_SCHEMA = `
CREATE TABLE IF NOT EXISTS ttf_whop_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  company_id text,
  resource_id text,
  whop_user_id text,
  product_id text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ttf_whop_events_type_time ON ttf_whop_events(event_type, received_at DESC);
CREATE TABLE IF NOT EXISTS ttf_whop_memberships (
  membership_id text PRIMARY KEY,
  company_id text,
  whop_member_id text,
  whop_user_id text NOT NULL,
  product_id text,
  product_title text,
  status text NOT NULL,
  discord_user_id text,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  renewal_period_end timestamptz,
  source_updated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ttf_whop_memberships_user ON ttf_whop_memberships(whop_user_id);
CREATE INDEX IF NOT EXISTS ttf_whop_memberships_discord ON ttf_whop_memberships(discord_user_id);
`;

class WhopStore {
  constructor(pool) {
    this.pool = pool || new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10000 });
    this.pool.on?.('error', error => console.error('[whop] database pool error', error.code || error.name));
  }

  async init() { await this.pool.query(WHOP_SCHEMA); }

  async claimEvent(event) {
    const data = event?.data || {};
    const result = await this.pool.query(
      `INSERT INTO ttf_whop_events(event_id,event_type,company_id,resource_id,whop_user_id,product_id)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING event_id`,
      [event?.id, event?.type || 'unknown', event?.company_id || data?.company?.id || null,
        data?.id || null, data?.user?.id || null, data?.product?.id || null],
    );
    return result.rowCount > 0;
  }

  async releaseEvent(eventId) {
    if (!eventId) return;
    await this.pool.query('DELETE FROM ttf_whop_events WHERE event_id=$1', [eventId]);
  }

  async upsertMembership(data) {
    if (!data?.id || !data?.user?.id) return;
    await this.pool.query(
      `INSERT INTO ttf_whop_memberships(
        membership_id,company_id,whop_member_id,whop_user_id,product_id,product_title,status,
        cancel_at_period_end,renewal_period_end,source_updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(membership_id) DO UPDATE SET
        company_id=EXCLUDED.company_id,
        whop_member_id=EXCLUDED.whop_member_id,
        whop_user_id=EXCLUDED.whop_user_id,
        product_id=EXCLUDED.product_id,
        product_title=EXCLUDED.product_title,
        status=EXCLUDED.status,
        cancel_at_period_end=EXCLUDED.cancel_at_period_end,
        renewal_period_end=EXCLUDED.renewal_period_end,
        source_updated_at=EXCLUDED.source_updated_at,
        updated_at=now()`,
      [data.id, data?.company?.id || process.env.WHOP_COMPANY_ID || null, data?.member?.id || null,
        data.user.id, data?.product?.id || null, data?.product?.title || null, data?.status || 'unknown',
        Boolean(data?.cancel_at_period_end), data?.renewal_period_end || null, data?.updated_at || null],
    );
  }

  async membershipsForUser(whopUserId) {
    return (await this.pool.query(
      'SELECT * FROM ttf_whop_memberships WHERE whop_user_id=$1 ORDER BY updated_at DESC',
      [whopUserId],
    )).rows;
  }

  async setDiscordUser(whopUserId, discordUserId) {
    await this.pool.query(
      'UPDATE ttf_whop_memberships SET discord_user_id=$2,updated_at=now() WHERE whop_user_id=$1',
      [whopUserId, discordUserId],
    );
  }

  async knownDiscordUser(whopUserId) {
    const row = (await this.pool.query(
      'SELECT discord_user_id FROM ttf_whop_memberships WHERE whop_user_id=$1 AND discord_user_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1',
      [whopUserId],
    )).rows[0];
    return row?.discord_user_id || null;
  }

  async counts() {
    const [events, memberships, linked] = await Promise.all([
      this.pool.query('SELECT count(*) FROM ttf_whop_events'),
      this.pool.query('SELECT count(*) FROM ttf_whop_memberships'),
      this.pool.query('SELECT count(DISTINCT whop_user_id) FROM ttf_whop_memberships WHERE discord_user_id IS NOT NULL'),
    ]);
    return {
      events: Number(events.rows[0].count),
      memberships: Number(memberships.rows[0].count),
      linkedUsers: Number(linked.rows[0].count),
    };
  }
}

module.exports = { WhopStore, WHOP_SCHEMA };
