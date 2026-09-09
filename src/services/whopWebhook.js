const http = require('node:http');
const crypto = require('node:crypto');

const MAX_BODY_BYTES = 256 * 1024;
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function candidateKeys(secret) {
  const clean = String(secret || '').trim();
  if (!clean) return [];

  const keys = [Buffer.from(clean, 'utf8')];
  for (const prefix of ['whsec_', 'ws_']) {
    if (!clean.startsWith(prefix)) continue;
    const encoded = clean.slice(prefix.length);
    try {
      const decoded = Buffer.from(encoded, 'base64');
      if (decoded.length) keys.push(decoded);
    } catch {}
  }
  return keys;
}

function safeEqualBase64(actualBase64, expectedBuffer) {
  let actual;
  try { actual = Buffer.from(actualBase64, 'base64'); }
  catch { return false; }
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function verifyWhopSignature(rawBody, headers, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const webhookId = headers['webhook-id'];
  const timestampRaw = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!webhookId || !timestampRaw || !signatureHeader) return false;

  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const signed = `${webhookId}.${timestampRaw}.${rawBody}`;
  const signatures = String(signatureHeader)
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.split(',', 2))
    .filter(([version, value]) => version === 'v1' && value);

  for (const key of candidateKeys(secret)) {
    const expected = crypto.createHmac('sha256', key).update(signed, 'utf8').digest();
    if (signatures.some(([, value]) => safeEqualBase64(value, expected))) return true;
  }
  return false;
}

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function summarizeEvent(event) {
  const data = event && typeof event.data === 'object' && event.data ? event.data : {};
  const product = data.product && typeof data.product === 'object' ? data.product.id : undefined;
  return {
    id: event?.id || 'unknown',
    type: event?.type || 'unknown',
    resource: data.id || undefined,
    product: product || undefined,
  };
}

function startWhopWebhookServer({ client, guildId }) {
  const port = Number(process.env.PORT || 3000);
  const companyId = String(process.env.WHOP_COMPANY_ID || '').trim();
  const webhookSecret = String(process.env.WHOP_WEBHOOK_SECRET || '').trim();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      send(res, 200, {
        ok: true,
        service: 'otrbot',
        discord: client?.isReady?.() || false,
        whop: {
          companyConfigured: Boolean(companyId),
          webhookSecretConfigured: Boolean(webhookSecret),
        },
      });
      return;
    }

    if (url.pathname !== '/api/webhooks/whop') {
      send(res, 404, { error: 'not_found' });
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      send(res, 405, { error: 'method_not_allowed' });
      return;
    }

    if (!webhookSecret) {
      send(res, 503, { error: 'whop_webhook_not_configured' });
      return;
    }

    let rawBody;
    try { rawBody = await readRawBody(req); }
    catch (error) {
      send(res, error.statusCode || 400, { error: 'invalid_request' });
      return;
    }

    if (!verifyWhopSignature(rawBody, req.headers, webhookSecret)) {
      console.warn('[whop] rejected webhook with invalid signature');
      send(res, 401, { error: 'invalid_signature' });
      return;
    }

    let event;
    try { event = JSON.parse(rawBody); }
    catch {
      send(res, 400, { error: 'invalid_json' });
      return;
    }

    const eventCompanyId = event?.data?.company_id || event?.company_id;
    if (companyId && eventCompanyId && eventCompanyId !== companyId) {
      console.warn('[whop] rejected webhook for unexpected company');
      send(res, 403, { error: 'wrong_company' });
      return;
    }

    const supported = new Set([
      'membership.activated',
      'membership.deactivated',
      'membership.cancel_at_period_end_changed',
      'payment.succeeded',
      'payment.failed',
      'refund.created',
    ]);
    const summary = summarizeEvent(event);
    console.log(`[whop] ${supported.has(event.type) ? 'received' : 'ignored'} ${JSON.stringify(summary)}`);

    // Role reconciliation is intentionally added after the three Whop product IDs are mapped.
    // Until then this endpoint safely verifies and acknowledges real Whop deliveries.
    send(res, 200, { received: true });
  });

  server.on('error', error => console.error('[whop] HTTP server error', error.code || error.name));
  server.listen(port, '0.0.0.0', () => {
    console.log(`[whop] HTTP receiver listening on :${port}; endpoint /api/webhooks/whop`);
    if (!webhookSecret) console.log('[whop] WHOP_WEBHOOK_SECRET not set yet; webhook POSTs will return 503 until configured');
    if (!companyId) console.warn('[whop] WHOP_COMPANY_ID missing; company validation is disabled');
  });
  return server;
}

module.exports = { startWhopWebhookServer, verifyWhopSignature };
