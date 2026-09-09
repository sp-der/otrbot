const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tierFromProduct, ACCESS_STATUSES, ROLE_BY_TIER } = require('../src/services/whopManager');

test('Whop product titles map to the three Trading Foundation tiers', () => {
  assert.equal(tierFromProduct('prod_e', 'The Foundation Essential'), 'essential');
  assert.equal(tierFromProduct('prod_p', 'The Foundation Premium'), 'premium');
  assert.equal(tierFromProduct('prod_g', 'The Foundation Personal Guide'), 'personal');
  assert.equal(tierFromProduct('prod_x', 'Free Community'), null);
});

test('one-time completed memberships keep access while expired/canceled do not', () => {
  assert.equal(ACCESS_STATUSES.has('completed'), true);
  assert.equal(ACCESS_STATUSES.has('canceling'), true);
  assert.equal(ACCESS_STATUSES.has('canceled'), false);
  assert.equal(ACCESS_STATUSES.has('expired'), false);
  assert.equal(ROLE_BY_TIER.premium, '🥇 Premium');
});
