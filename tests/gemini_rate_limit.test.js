const test = require('node:test');
const assert = require('node:assert');

test('Gemini concurrency limit and exponential backoff retry simulation', async () => {
  let callCount = 0;
  
  // Simulate a function that fails twice with 429 and succeeds on 3rd attempt
  async function mockGeminiCall(shouldFailTimes) {
    callCount++;
    if (callCount <= shouldFailTimes) {
      throw new Error('[429 Too Many Requests] Resource exhausted: quota exceeded');
    }
    return 'Success response from Gemini 1.5 Flash';
  }

  // Simulate retry logic with exponential backoff & jitter
  async function executeWithRetry(fn, maxRetries = 3) {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        return await fn();
      } catch (err) {
        const is429 = err.message.includes('429') || err.message.includes('quota');
        if (is429 && attempt < maxRetries) {
          attempt++;
          const delay = Math.min(Math.pow(2, attempt) * 10 + Math.random() * 10, 100);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
  }

  // Test 1: Succeeds after 2 failures
  callCount = 0;
  const res = await executeWithRetry(() => mockGeminiCall(2));
  assert.strictEqual(res, 'Success response from Gemini 1.5 Flash');
  assert.strictEqual(callCount, 3);

  // Test 2: Fails when max retries exceeded
  callCount = 0;
  let errorCaught = null;
  try {
    await executeWithRetry(() => mockGeminiCall(5), 2);
  } catch (err) {
    errorCaught = err;
  }
  assert.ok(errorCaught);
  assert.ok(errorCaught.message.includes('quota'));
});
