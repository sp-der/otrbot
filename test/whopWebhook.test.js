const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyWhopSignature } = require('../src/services/whopWebhook');

function signedHeaders({ secret, id = 'msg_test', timestamp = 1_725_000_000, body }) {
  const signed = `${id}.${timestamp}.${body}`;
  const signature = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('base64');
  return {
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signature}`,
  };
}

test('accepts a valid signature using the configured secret bytes', () => {
  const secret = 'ws_test_secret_for_otrbot';
  const body = JSON.stringify({ id: 'msg_test', type: 'membership.activated', data: {} });
  const now = 1_725_000_000;
  assert.equal(verifyWhopSignature(body, signedHeaders({ secret, body, timestamp: now }), secret, now), true);
});

test('rejects a changed body', () => {
  const secret = 'ws_test_secret_for_otrbot';
  const body = JSON.stringify({ id: 'msg_test', type: 'membership.activated', data: {} });
  const now = 1_725_000_000;
  const headers = signedHeaders({ secret, body, timestamp: now });
  assert.equal(verifyWhopSignature(`${body} `, headers, secret, now), false);
});

test('rejects stale deliveries', () => {
  const secret = 'ws_test_secret_for_otrbot';
  const body = '{}';
  const timestamp = 1_725_000_000;
  const headers = signedHeaders({ secret, body, timestamp });
  assert.equal(verifyWhopSignature(body, headers, secret, timestamp + 301), false);
});
