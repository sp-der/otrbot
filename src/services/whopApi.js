const API_BASE = 'https://api.whop.com/api/v1';
const LEGACY_SOCIAL_BASE = 'https://api.whop.com/api/v5/company';

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

async function request(path, { query, base = API_BASE } = {}) {
  const url = new URL(path, `${base}/`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, String(item));
    else url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${apiKey()}`, accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const error = new Error(`Whop API request failed with ${response.status}`);
    error.code = `WHOP_HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
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
  return listAll('products', { company_id: companyId() });
}

function listMemberships() {
  return listAll('memberships', { company_id: companyId() });
}

async function discordSocialAccount(userId) {
  if (!userId) return null;
  const accounts = await request(`users/${encodeURIComponent(userId)}/social_accounts`, { base: LEGACY_SOCIAL_BASE });
  if (!Array.isArray(accounts)) return null;
  return accounts.find(account => account?.service === 'discord' && account?.account_id) || null;
}

module.exports = { API_BASE, companyId, listProducts, listMemberships, discordSocialAccount };
