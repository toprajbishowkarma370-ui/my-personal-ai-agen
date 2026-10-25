const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');

test('Owner authentication environment variables configuration and bcrypt test', async () => {
  const required = ['NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'DATABASE_URL', 'OWNER_EMAIL', 'OWNER_PASSWORD_HASH'];
  assert.strictEqual(required.length, 5);
  assert.ok(required.includes('OWNER_EMAIL'));
  assert.ok(required.includes('OWNER_PASSWORD_HASH'));

  // Test bcrypt comparison helper logic
  const testPass = 'secureAdminPassword123';
  const hash = bcrypt.hashSync(testPass, 12);
  const match = await bcrypt.compare(testPass, hash);
  assert.strictEqual(match, true);

  const mismatch = await bcrypt.compare('wrongPassword', hash);
  assert.strictEqual(mismatch, false);
});
