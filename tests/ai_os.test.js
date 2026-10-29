const test = require('node:test');
const assert = require('node:assert');

test('1. CRM Lead Duplicate Prevention & Pipeline Status Simulation', () => {
  const leads = [{ id: 'l1', company: 'Hotel Samjhana', status: 'WAITING_APPROVAL' }];
  
  function addLead(company) {
    const norm = company.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (leads.some(l => l.company.toLowerCase().replace(/[^a-z0-9]/g, '') === norm)) {
      throw new Error('Duplicate lead detected');
    }
    const newLead = { id: 'l' + (leads.length + 1), company, status: 'WAITING_APPROVAL' };
    leads.push(newLead);
    return newLead;
  }

  assert.throws(() => addLead('hotel samjhana'), /Duplicate lead detected/);
  const added = addLead('Everest Craft');
  assert.strictEqual(added.company, 'Everest Craft');
  assert.strictEqual(added.status, 'WAITING_APPROVAL');
});

test('2. Automation Task Orchestrator, Retry Limits & Pause/Resume Simulation', () => {
  let tasks = [{ id: 't1', title: 'Daily Scan', status: 'PLANNED', retries: 0, maxRetries: 3 }];

  function updateTaskStatus(id, status) {
    const t = tasks.find(x => x.id === id);
    if (!t) throw new Error('Task not found');
    t.status = status;
    return t;
  }

  function executeTask(id) {
    const t = tasks.find(x => x.id === id);
    if (t.status === 'PAUSED') throw new Error('Task is paused');
    try {
      // simulate execution failure
      throw new Error('Network timeout');
    } catch (err) {
      t.retries++;
      if (t.retries >= t.maxRetries) {
        t.status = 'FAILED';
      } else {
        t.status = 'RETRYING';
      }
      return t;
    }
  }

  const paused = updateTaskStatus('t1', 'PAUSED');
  assert.strictEqual(paused.status, 'PAUSED');
  assert.throws(() => executeTask('t1'), /Task is paused/);

  updateTaskStatus('t1', 'IN_PROGRESS');
  const result = executeTask('t1');
  assert.strictEqual(result.retries, 1);
  assert.strictEqual(result.status, 'RETRYING');
});

test('3. Voice AI Safety Guardrails & Consent Simulation', () => {
  function initiateOutboundCall(contact, consentGiven, ownerApproved, spendLimitNpr, currentSpendNpr) {
    if (!consentGiven) {
      return { success: false, reason: 'Consent check failed: recipient consent not verified' };
    }
    if (!ownerApproved) {
      return { success: false, reason: 'Outbound call blocked: owner approval required' };
    }
    if (currentSpendNpr >= spendLimitNpr) {
      return { success: false, reason: 'Spend limit reached' };
    }
    return { success: true, aiIdentityDisclosed: true, transcriptLogged: true };
  }

  // Without consent
  const res1 = initiateOutboundCall('+9779800000000', false, true, 500, 100);
  assert.strictEqual(res1.success, false);

  // Without owner approval
  const res2 = initiateOutboundCall('+9779800000000', true, false, 500, 100);
  assert.strictEqual(res2.success, false);

  // With consent and owner approval
  const res3 = initiateOutboundCall('+9779800000000', true, true, 500, 100);
  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.aiIdentityDisclosed, true);
});

test('4. YouTube Channel Manager Owner Approval & Policy Workflow Simulation', () => {
  function publishVideo(videoTitle, ownerApproved, copyrightChecked) {
    if (!copyrightChecked) {
      return { success: false, reason: 'Copyright policy check failed' };
    }
    if (!ownerApproved) {
      return { success: false, reason: 'Publishing blocked: Owner approval required before public publishing' };
    }
    return { success: true, status: 'PUBLISHED' };
  }

  const res1 = publishVideo('Chaurjahari Tech Trends', false, true);
  assert.strictEqual(res1.success, false);

  const res2 = publishVideo('Chaurjahari Tech Trends', true, true);
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.status, 'PUBLISHED');
});
