const test = require('node:test');
const assert = require('node:assert');

test('Lead company normalization and deduplication logic simulation', () => {
  function normalizeCompanyName(name) {
    return name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  }

  const existingLeads = [
    { id: '1', company: 'Hotel Samjhana & Lodging' },
    { id: '2', company: 'Bheri Valley Public Secondary School' }
  ];

  const newLead1 = 'Hotel Samjhana & Lodging';
  const newLead2 = 'HOTEL SAMJHANA & LODGING';
  const newLead3 = 'Karnali Agro Seed';

  const normExisting = existingLeads.map(l => normalizeCompanyName(l.company));

  assert.strictEqual(normExisting.includes(normalizeCompanyName(newLead1)), true);
  assert.strictEqual(normExisting.includes(normalizeCompanyName(newLead2)), true);
  assert.strictEqual(normExisting.includes(normalizeCompanyName(newLead3)), false);
});

test('Sales pipeline lead status updates and validation simulation', () => {
  let leads = [{ id: 'l1', company: 'Test Hotel', status: 'WAITING_APPROVAL', score: 85 }];

  function createLead(body) {
    if (!body.company || !body.company.trim()) {
      throw new Error('Company name is required');
    }
    const norm = body.company.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (leads.some(l => l.company.toLowerCase().replace(/[^a-z0-9]/g, '') === norm)) {
      throw new Error('Duplicate lead detected');
    }
    const newLead = { id: 'l' + (leads.length + 1), company: body.company.trim(), status: 'WAITING_APPROVAL', score: 80 };
    leads.push(newLead);
    return newLead;
  }

  // 1. Invalid input validation (empty company)
  assert.throws(() => createLead({ company: '   ' }), /Company name is required/);

  // 2. Duplicate lead detection
  assert.throws(() => createLead({ company: 'Test Hotel' }), /Duplicate lead detected/);

  // 3. Successful lead creation
  const created = createLead({ company: 'New Venture Nepal' });
  assert.strictEqual(created.company, 'New Venture Nepal');
  assert.strictEqual(created.status, 'WAITING_APPROVAL');

  // 4. Pipeline status update
  function updateLeadStatus(id, newStatus) {
    const l = leads.find(x => x.id === id);
    if (!l) throw new Error('Lead not found');
    l.status = newStatus;
    return l;
  }

  const updated = updateLeadStatus(created.id, 'AUTHORIZED');
  assert.strictEqual(updated.status, 'AUTHORIZED');
});

test('Unauthorized requests simulation', () => {
  function simulateAdminCheck(session) {
    if (!session || session.role !== 'ADMIN') {
      throw new Error('Unauthorized');
    }
    return true;
  }

  assert.strictEqual(simulateAdminCheck({ role: 'ADMIN' }), true);
  assert.throws(() => simulateAdminCheck(null), /Unauthorized/);
  assert.throws(() => simulateAdminCheck({ role: 'CLIENT' }), /Unauthorized/);
});

test('Approval gate requirement simulation', () => {
  const outreach = { id: 'o1', channel: 'EMAIL', status: 'STAGED' };
  function dispatchOutreach(item) {
    if (item.status !== 'AUTHORIZED') {
      throw new Error('Outreach blocked: Owner approval required');
    }
    return 'Sent successfully';
  }

  assert.throws(() => dispatchOutreach(outreach), /Outreach blocked: Owner approval required/);
  outreach.status = 'AUTHORIZED';
  assert.strictEqual(dispatchOutreach(outreach), 'Sent successfully');
});
