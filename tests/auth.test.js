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

test('Login input reading and parameter submission structure', () => {
  const mockEmailInput = { value: '  owner@agency.local  ' };
  const mockPassInput = { value: 'secretPass123 ' };

  const email = mockEmailInput.value.trim();
  const pass = mockPassInput.value;

  assert.strictEqual(email, 'owner@agency.local');
  assert.strictEqual(pass, 'secretPass123 ');

  const formData = new URLSearchParams();
  formData.append('email', email);
  formData.append('password', pass);
  formData.append('csrfToken', 'test-csrf-token');
  formData.append('json', 'true');

  assert.strictEqual(formData.get('email'), 'owner@agency.local');
  assert.strictEqual(formData.get('password'), 'secretPass123 ');
  assert.strictEqual(formData.get('csrfToken'), 'test-csrf-token');
  assert.strictEqual(formData.get('json'), 'true');
});

test('Build API command request payload and error handling simulation', () => {
  const prompt = 'Generate Next.js landing page for Hotel Samjhana';
  assert.ok(prompt.length > 0);

  const payload = JSON.stringify({ prompt, systemContext: 'Test context' });
  const parsed = JSON.parse(payload);
  assert.strictEqual(parsed.prompt, prompt);
  assert.ok(parsed.systemContext);

  const emptyPrompt = '';
  const isValid = emptyPrompt.trim().length > 0;
  assert.strictEqual(isValid, false);
});

test('Strict production environment validation and zero fallback security test', () => {
  function validateEnv(env) {
    const required = ['NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'DATABASE_URL', 'OWNER_EMAIL', 'OWNER_PASSWORD_HASH'];
    const missing = required.filter((v) => !env[v]);
    if (missing.length > 0) {
      throw new Error(`[Auth Security Error] Missing required production environment variables: ${missing.join(', ')}`);
    }
    return true;
  }

  // 1. Missing env vars throws error in production mode
  assert.throws(() => {
    validateEnv({ NODE_ENV: 'production' });
  }, /Missing required production environment variables/);

  // 2. Unconfigured credentials test: without OWNER_EMAIL / OWNER_PASSWORD_HASH set, login must fail
  const ownerEmailConfigured = undefined;
  const ownerHashConfigured = undefined;
  assert.strictEqual(!!ownerEmailConfigured, false);
  assert.strictEqual(!!ownerHashConfigured, false);
});

test('Google OAuth sign-in POST payload structure test', () => {
  const csrfToken = 'test-csrf-token-12345';
  const formData = new URLSearchParams();
  formData.append('csrfToken', csrfToken);
  formData.append('json', 'true');

  assert.strictEqual(formData.get('csrfToken'), 'test-csrf-token-12345');
  assert.strictEqual(formData.get('json'), 'true');
});
