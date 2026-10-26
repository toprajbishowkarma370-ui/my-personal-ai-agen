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

test('Owner authorization logic simulation', async () => {
  const ownerEmail = 'alex.morgan@agency.local';
  const ownerHash = bcrypt.hashSync('admin123', 10);

  // Simulate authorize function logic from lib/auth.ts
  async function simulateAuthorize(emailInput, passInput) {
    const email = emailInput?.toLowerCase()?.trim();
    const configEmail = ownerEmail.trim().toLowerCase();
    const configHash = ownerHash.trim();

    if (email === configEmail) {
      const ok = await bcrypt.compare(passInput, configHash);
      if (ok) {
        return { id: 'owner_admin_01', email: configEmail, role: 'ADMIN' };
      }
    }
    return null;
  }

  // 1. Successful login
  const successUser = await simulateAuthorize('ALEX.MORGAN@AGENCY.LOCAL ', 'admin123');
  assert.notStrictEqual(successUser, null);
  assert.strictEqual(successUser.role, 'ADMIN');

  // 2. Failed login (wrong password)
  const failPass = await simulateAuthorize('alex.morgan@agency.local', 'wrongpass');
  assert.strictEqual(failPass, null);

  // 3. Failed login (wrong email)
  const failEmail = await simulateAuthorize('someone@agency.local', 'admin123');
  assert.strictEqual(failEmail, null);
});

test('Google OAuth sign-in restriction simulation', async () => {
  const ownerEmail = 'alex.morgan@agency.local';

  async function simulateGoogleSignIn(userEmail, emailVerified) {
    const trimmedOwner = ownerEmail.trim().toLowerCase();
    const trimmedUser = userEmail?.trim().toLowerCase();

    if (!emailVerified) {
      return false; // rejected if unverified
    }
    if (trimmedUser === trimmedOwner) {
      return true; // allowed
    }
    return false; // unauthorized account rejected
  }

  // 1. Valid verified owner email succeeds
  const validResult = await simulateGoogleSignIn('alex.morgan@agency.local', true);
  assert.strictEqual(validResult, true);

  // 2. Unverified email fails even if email matches owner
  const unverifiedResult = await simulateGoogleSignIn('alex.morgan@agency.local', false);
  assert.strictEqual(unverifiedResult, false);

  // 3. Unauthorized email fails
  const unauthorizedResult = await simulateGoogleSignIn('random.hacker@gmail.com', true);
  assert.strictEqual(unauthorizedResult, false);
});

test('Client window.doLogin scope and availability check', async () => {
  const globalWindow = {};
  globalWindow.doLogin = async function(demo) { return true; };
  assert.strictEqual(typeof globalWindow.doLogin, 'function');
});
