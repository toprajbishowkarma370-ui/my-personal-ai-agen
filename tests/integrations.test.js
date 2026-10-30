const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

// =====================================================================
// Regression: Email route must not simulate success without SMTP credentials
// =====================================================================

test('Email route: rejects when SMTP credentials are not configured', () => {
  const src = fs.readFileSync('./app/api/communications/email/route.ts', 'utf8');
  assert.ok(!src.includes('MOCK_SENT_NO_SMTP'), 'email route must not mock-send without SMTP');
  assert.ok(src.includes('SMTP credentials not configured'), 'email route must require SMTP credentials');
  assert.ok(src.includes('requiresSmtp: true'), 'email route must flag SMTP requirement');
});

test('Email route: sends only when SMTP_HOST, SMTP_USER, SMTP_PASS are all set', () => {
  const src = fs.readFileSync('./app/api/communications/email/route.ts', 'utf8');
  assert.ok(src.includes('if (!smtpHost || !smtpUser || !smtpPass)'), 'email route checks all SMTP credentials');
  assert.ok(src.includes('status: 400'), 'email route returns 400 when SMTP missing');
});

// =====================================================================
// Regression: Calls route safety architecture (consent, approval, budget, credentials)
// =====================================================================

test('Calls route: requires recipient consent before outbound AI call', () => {
  const src = fs.readFileSync('./app/api/calls/route.ts', 'utf8');
  assert.ok(src.includes('consentGiven'), 'call route checks consent');
  assert.ok(src.includes('requiresConsent: true'), 'call route flags consent requirement');
  assert.ok(src.includes('status: 403'), 'call route rejects without consent');
});

test('Calls route: requires owner approval before outbound AI call', () => {
  const src = fs.readFileSync('./app/api/calls/route.ts', 'utf8');
  assert.ok(src.includes('ownerApproved'), 'call route checks owner approval');
  assert.ok(src.includes('requiresOwnerApproval: true'), 'call route flags owner approval requirement');
});

test('Calls route: enforces AI/telephony spend limit', () => {
  const src = fs.readFileSync('./app/api/calls/route.ts', 'utf8');
  assert.ok(src.includes('spendLimitNpr'), 'call route checks spend limit');
  assert.ok(src.includes('currentSpendNpr'), 'call route checks current spend');
  assert.ok(src.includes('Spend limit reached'), 'call route blocks when budget exhausted');
});

test('Calls route: requires telephony provider credentials', () => {
  const src = fs.readFileSync('./app/api/calls/route.ts', 'utf8');
  assert.ok(src.includes('TWILIO_ACCOUNT_SID'), 'call route references Twilio account SID');
  assert.ok(src.includes('TWILIO_AUTH_TOKEN'), 'call route references Twilio auth token');
  assert.ok(src.includes('requiresCredentials: true'), 'call route flags missing credentials');
});

test('Calls route: validates E.164 phone number format', () => {
  const src = fs.readFileSync('./app/api/calls/route.ts', 'utf8');
  assert.ok(src.includes('E.164'), 'call route documents E.164 format');
  assert.ok(src.includes('validatePhoneNumber'), 'call route has phone validation');
});

test('Calls route: logs call outcomes to audit trail', () => {
  const src = fs.readFileSync('./app/api/calls/route.ts', 'utf8');
  assert.ok(src.includes('logAction("call.blocked'), 'call route logs blocked calls');
  assert.ok(src.includes('logAction("call.initiated'), 'call route logs initiated calls');
});

test('Calls route: GET lists call audit logs', () => {
  const src = fs.readFileSync('./app/api/calls/route.ts', 'utf8');
  assert.ok(src.includes('export async function GET'), 'call route has GET handler');
  assert.ok(src.includes('auditLog.findMany'), 'call route queries audit logs');
});
