const { WhopStore } = require('./whopStore');
const { listProducts, listMemberships, discordSocialAccount } = require('./whopApi');
const { syncFoundationMember } = require('./membership');

const PAID_ROLES = ['🥉 Essential', '🥇 Premium', '👑 Personal Guide'];
const ACCESS_STATUSES = new Set(['active', 'trialing', 'canceling', 'completed']);
const TIER_PRIORITY = ['personal', 'premium', 'essential'];
const ROLE_BY_TIER = {
  essential: '🥉 Essential',
  premium: '🥇 Premium',
  personal: '👑 Personal Guide',
};
const RECONCILE_INTERVAL_MS = 15 * 60 * 1000;

function tierFromProduct(productId, title) {
  const explicit = {
    essential: String(process.env.WHOP_PRODUCT_ESSENTIAL_ID || '').trim(),
    premium: String(process.env.WHOP_PRODUCT_PREMIUM_ID || '').trim(),
    personal: String(process.env.WHOP_PRODUCT_PERSONAL_ID || '').trim(),
  };
  for (const [tier, id] of Object.entries(explicit)) if (id && productId === id) return tier;
  const normalized = String(title || '').toLowerCase();
  if (normalized.includes('personal guide')) return 'personal';
  if (normalized.includes('premium')) return 'premium';
  if (normalized.includes('essential')) return 'essential';
  return null;
}

class WhopManager {
  constructor(client, guildId, store) {
    this.client = client;
    this.guildId = guildId;
    this.store = store || new WhopStore();
    this.ready = this.store.init();
    this.products = [];
    this.lastSync = null;
    this.lastSyncResult = null;
    this.timer = null;
  }

  async init() {
    await this.ready;
    console.log('[whop] membership database ready');
    try { await this.refreshProducts(); }
    catch (error) { console.error('[whop] product discovery failed', error.code || error.name); }
    try { await this.syncAll(); }
    catch (error) { console.error('[whop] startup membership sync failed', error.code || error.name); }
    if (!this.timer) {
      this.timer = setInterval(() => this.syncAll().catch(error => console.error('[whop] scheduled membership sync failed', error.code || error.name)), RECONCILE_INTERVAL_MS);
      this.timer.unref();
      console.log('[whop] self-healing membership sync scheduled every 15 minutes');
    }
  }

  async refreshProducts() {
    this.products = await listProducts();
    const mapped = Object.fromEntries(TIER_PRIORITY.map(tier => {
      const product = this.products.find(p => tierFromProduct(p.id, p.title) === tier);
      return [tier, product ? `${product.title} (${product.id})` : 'unmapped'];
    }));
    console.log(`[whop] products discovered=${this.products.length}; tiers=${JSON.stringify(mapped)}`);
    return this.products;
  }

  async acceptEvent(event) {
    await this.ready;
    const isNew = await this.store.claimEvent(event);
    if (!isNew) return { duplicate: true };
    if (String(event?.type || '').startsWith('membership.') && event?.data?.id && event?.data?.user?.id) {
      await this.store.upsertMembership(event.data);
    }
    setImmediate(() => this.processEvent(event).catch(error => console.error('[whop] async event processing failed', error.code || error.name)));
    return { duplicate: false };
  }

  async processEvent(event) {
    const type = String(event?.type || 'unknown');
    const data = event?.data || {};
    if (type.startsWith('membership.') && data?.user?.id) await this.reconcileUser(data.user.id);
    await this.postActivity(event).catch(error => console.error('[whop] activity log failed', error.code || error.name));
  }

  async resolveDiscordId(whopUserId) {
    const known = await this.store.knownDiscordUser(whopUserId);
    if (known) return known;
    const account = await discordSocialAccount(whopUserId).catch(error => {
      console.warn('[whop] Discord social lookup failed', error.code || error.name);
      return null;
    });
    if (!account?.account_id) return null;
    await this.store.setDiscordUser(whopUserId, String(account.account_id));
    return String(account.account_id);
  }

  async reconcileUser(whopUserId) {
    const memberships = await this.store.membershipsForUser(whopUserId);
    const activeTiers = memberships
      .filter(m => ACCESS_STATUSES.has(String(m.status || '').toLowerCase()))
      .map(m => tierFromProduct(m.product_id, m.product_title))
      .filter(Boolean);
    const desiredTier = TIER_PRIORITY.find(tier => activeTiers.includes(tier)) || null;
    const discordId = await this.resolveDiscordId(whopUserId);
    if (!discordId) {
      console.log(`[whop] pending Discord link for user ${whopUserId}; desired=${desiredTier || 'community-only'}`);
      return { linked: false, desiredTier };
    }
    const guild = this.client.guilds.cache.get(this.guildId) || await this.client.guilds.fetch(this.guildId).catch(() => null);
    if (!guild) throw Object.assign(new Error('Discord guild unavailable'), { code: 'GUILD_UNAVAILABLE' });
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) {
      console.log(`[whop] linked Discord user ${discordId} is not in the server yet`);
      return { linked: true, inGuild: false, desiredTier };
    }

    const desiredRoleName = desiredTier ? ROLE_BY_TIER[desiredTier] : null;
    for (const roleName of PAID_ROLES) {
      const role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) continue;
      const shouldHave = roleName === desiredRoleName;
      const has = member.roles.cache.has(role.id);
      if (shouldHave && !has) await member.roles.add(role, `Whop access sync: ${desiredTier}`);
      if (!shouldHave && has) await member.roles.remove(role, 'Whop access sync: tier no longer active');
    }
    await syncFoundationMember(member);
    console.log(`[whop] reconciled ${discordId}; tier=${desiredTier || 'none'}`);
    return { linked: true, inGuild: true, desiredTier };
  }

  async syncAll() {
    await this.ready;
    const memberships = await listMemberships();
    const users = new Set();
    for (const membership of memberships) {
      if (!membership?.id || !membership?.user?.id) continue;
      await this.store.upsertMembership(membership);
      users.add(membership.user.id);
    }
    let linked = 0, inGuild = 0;
    for (const userId of users) {
      const result = await this.reconcileUser(userId).catch(error => {
        console.error('[whop] user reconciliation failed', error.code || error.name);
        return null;
      });
      if (result?.linked) linked++;
      if (result?.inGuild) inGuild++;
    }
    this.lastSync = new Date();
    this.lastSyncResult = { memberships: memberships.length, users: users.size, linked, inGuild };
    console.log(`[whop] full sync complete ${JSON.stringify(this.lastSyncResult)}`);
    return this.lastSyncResult;
  }

  async status() {
    await this.ready;
    const counts = await this.store.counts();
    return {
      apiConfigured: Boolean(process.env.WHOP_COMPANY_API_KEY && process.env.WHOP_COMPANY_ID),
      webhookConfigured: Boolean(process.env.WHOP_WEBHOOK_SECRET),
      products: this.products.map(product => ({ id: product.id, title: product.title, tier: tierFromProduct(product.id, product.title) })),
      counts,
      lastSync: this.lastSync,
      lastSyncResult: this.lastSyncResult,
    };
  }

  async postActivity(event) {
    const guild = this.client.guilds.cache.get(this.guildId);
    const channel = guild?.channels?.cache?.find(c => c.name === '💳・whop-activity' && c.isTextBased?.());
    if (!channel) return;
    const data = event?.data || {};
    const tier = tierFromProduct(data?.product?.id, data?.product?.title);
    const discordId = data?.user?.id ? await this.store.knownDiscordUser(data.user.id) : null;
    const subject = discordId ? `<@${discordId}>` : (data?.user?.username ? `Whop user **${String(data.user.username).slice(0, 80)}**` : 'Whop member');
    const tierText = tier ? ` • ${ROLE_BY_TIER[tier]}` : '';
    await channel.send({
      content: `💳 **${event?.type || 'Whop event'}**${tierText}\n${subject}${data?.product?.title ? ` • ${String(data.product.title).slice(0, 120)}` : ''}`,
      allowedMentions: { parse: [] },
    });
  }
}

module.exports = { WhopManager, tierFromProduct, ACCESS_STATUSES, ROLE_BY_TIER };
