const API_BASE = 'https://api.whop.com/api/v1';
const LEGACY_SOCIAL_BASE = 'https://api.whop.com/v5/company';

function apiKey() {
  const key = String(process.env.WHOP_COMPANY_API_KEY || '').trim();
  if (!key) throw Object.assign(new Error('WHOP_COMPANY_API_KEY is not configured'), { code: 'WHOP_API_KEY_MISSING' });
  return key;
}

function companyId() {
  const id = String(process.env.WHOP_COMPANY_ID || '').trim();
  if (!id) throw Object.assign(new Error('WHOP_COMPANY_ID is not configured'), { code: 'WHOP_COMPANY_ID_MISSING' });
  return id;
}

async function request(path, { query, base = API_BASE, method = 'GET', body } = {}) {
  const url = new URL(path, `${base}/`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, String(item));
    else url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${apiKey()}`,
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    let details;
    try { details = await response.json(); } catch {}
    const suffix = details?.message ? `: ${details.message}` : '';
    const error = new Error(`Whop API request failed with ${response.status}${suffix}`);
    error.code = `WHOP_HTTP_${response.status}`;
    error.status = response.status;
    error.details = details;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

async function listAll(path, query) {
  const out = [];
  let after;
  for (let page = 0; page < 100; page++) {
    const body = await request(path, { query: { ...query, first: 100, ...(after ? { after } : {}) } });
    out.push(...(Array.isArray(body?.data) ? body.data : []));
    if (!body?.page_info?.has_next_page || !body?.page_info?.end_cursor) break;
    after = body.page_info.end_cursor;
  }
  return out;
}

function listProducts() {
  return listAll('products', { account_id: companyId() });
}

function listMemberships() {
  return listAll('memberships', { account_id: companyId() });
}

async function discordSocialAccount(userId) {
  if (!userId) return null;
  const accounts = await request(`users/${encodeURIComponent(userId)}/social_accounts`, { base: LEGACY_SOCIAL_BASE });
  if (!Array.isArray(accounts)) return null;
  return accounts.find(account => account?.service === 'discord' && account?.account_id) || null;
}

function listForumPosts(experienceId) {
  const target = String(experienceId || '').trim();
  if (!target) throw Object.assign(new Error('Whop announcements experience is not configured'), { code: 'WHOP_ANNOUNCEMENTS_EXPERIENCE_MISSING' });
  return listAll('forum_posts', { experience_id: target });
}

async function createForumPost(experienceId, { content, pinned = false } = {}) {
  const target = String(experienceId || '').trim();
  const text = String(content || '').trim();
  if (!target) throw Object.assign(new Error('Whop announcements experience is not configured'), { code: 'WHOP_ANNOUNCEMENTS_EXPERIENCE_MISSING' });
  if (!text) throw Object.assign(new Error('Whop announcement content is empty'), { code: 'WHOP_ANNOUNCEMENT_EMPTY' });
  return request('forum_posts', {
    method: 'POST',
    body: { experience_id: target, content: text, pinned: Boolean(pinned) },
  });
}

module.exports = { API_BASE, companyId, listProducts, listMemberships, discordSocialAccount, listForumPosts, createForumPost };
