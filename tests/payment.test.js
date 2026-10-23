// Automated tests for QR payment workflow and persistence using node --test
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../src/server');
const store = require('../src/models/store');

let server;
let baseUrl;
const ownerToken = 'secret-owner-token';

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
  });
});

test.beforeEach(async () => {
  await store.reset();
});

test('1. Owner-only QR configuration and authentication checks', async () => {
  let res = await fetch(`${baseUrl}/api/owner/qr`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qrImageUrl: 'https://example.com/my-qr.png' })
  });
  assert.strictEqual(res.status, 401);

  res = await fetch(`${baseUrl}/api/owner/qr`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    },
    body: JSON.stringify({ qrImageUrl: 'https://example.com/my-qr.png' })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.settings.qrImageUrl, 'https://example.com/my-qr.png');
});

test('2. Invoice creation, customer viewing with QR display, and payment submission workflow', async () => {
  await store.updateOwnerSettings({ qrImageUrl: 'https://example.com/qr.png' });

  let invRes = await fetch(`${baseUrl}/api/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    },
    body: JSON.stringify({ customerName: 'Alice', amount: 150.0, description: 'Web dev services' })
  });
  assert.strictEqual(invRes.status, 201);
  const invData = await invRes.json();
  const invoiceId = invData.invoice.id;
  assert.strictEqual(invData.invoice.status, 'Pending');

  let custRes = await fetch(`${baseUrl}/api/invoices/${invoiceId}`);
  assert.strictEqual(custRes.status, 200);
  const custData = await custRes.json();
  assert.strictEqual(custData.invoice.id, invoiceId);
  assert.strictEqual(custData.paymentInstructions.qrImageUrl, 'https://example.com/qr.png');

  let payRes = await fetch(`${baseUrl}/api/invoices/${invoiceId}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionRef: 'TXN123456789' })
  });
  assert.strictEqual(payRes.status, 200);
  const payData = await payRes.json();
  assert.strictEqual(payData.invoice.status, 'Submitted for Verification');
  assert.strictEqual(payData.invoice.transactionRef, 'TXN123456789');
  assert.notStrictEqual(payData.invoice.status, 'Verified/Paid');
});

test('3. Owner verification (approval / rejection) and audit logging', async () => {
  const invoice = await store.createInvoice({ customerName: 'Bob', amount: 200 });
  await store.submitPayment(invoice.id, { transactionRef: 'TXN98765' });

  const fetchedInv = await store.getInvoice(invoice.id);
  assert.strictEqual(fetchedInv.status, 'Submitted for Verification');

  let verifyRes = await fetch(`${baseUrl}/api/invoices/${invoice.id}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    },
    body: JSON.stringify({ action: 'approve' })
  });
  assert.strictEqual(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyData.invoice.status, 'Verified/Paid');

  let logsRes = await fetch(`${baseUrl}/api/owner/audit-logs`, {
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  assert.strictEqual(logsRes.status, 200);
  const logsData = await logsRes.json();
  assert.strictEqual(logsData.success, true);
  assert.ok(logsData.logs.length > 0);
  
  const hasApproveLog = logsData.logs.some(l => l.action === 'VERIFY_PAYMENT_APPROVED');
  assert.strictEqual(hasApproveLog, true);
});

test('4. Data persistence across store reload', async () => {
  const invoice = await store.createInvoice({ customerName: 'Charlie', amount: 300 });
  await store.updateOwnerSettings({ qrImageUrl: 'https://example.com/charlie-qr.png' });

  const StoreClass = store.constructor;
  const reloadedStore = new StoreClass();
  
  const loadedInv = await reloadedStore.getInvoice(invoice.id);
  assert.strictEqual(loadedInv.customerName, 'Charlie');
  assert.strictEqual(loadedInv.amount, 300);

  const loadedSettings = await reloadedStore.getOwnerSettings();
  assert.strictEqual(loadedSettings.qrImageUrl, 'https://example.com/charlie-qr.png');
});
