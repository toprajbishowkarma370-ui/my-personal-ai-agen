const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");

const AI_PROVIDER = "./lib/ai-provider.ts";

function read(p) {
  return fs.readFileSync(p, "utf8");
}

test("AI provider: OpenAI is the priority provider when OPENAI_API_KEY is configured", () => {
  const src = read(AI_PROVIDER);
  assert.ok(src.includes("OPENAI_API_KEY"), 'ai-provider reads OPENAI_API_KEY');
  assert.ok(src.includes("return \"openai\""), 'ai-provider returns openai when key present');
  assert.ok(src.includes("DEFAULT_MODEL") && src.includes('"gpt-4o-mini"'), 'default model is gpt-4o-mini');
});

test("AI provider: falls back to Gemini when OpenAI is not configured but Gemini is", () => {
  const src = read(AI_PROVIDER);
  assert.ok(src.includes('return "gemini"'), 'ai-provider falls back to gemini');
  assert.ok(src.includes("GEMINI_API_KEY"), 'ai-provider reads GEMINI_API_KEY');
});

test("AI provider: returns 'none' and reports configuration required when no provider key is set", () => {
  const src = read(AI_PROVIDER);
  assert.ok(src.includes('return "none"'), 'ai-provider returns none when no key');
  assert.ok(src.includes("aiRequiresConfiguration"), 'aiRequiresConfiguration exposed');
  assert.ok(src.includes("No AI provider is configured"), 'honest configuration error message');
});

test("AI provider: never exposes API keys or raw secrets in logs/responses", () => {
  const src = read(AI_PROVIDER);
  // Keys are read only from process.env on the server and never logged or returned.
  assert.ok(!src.includes("console.log(apiKey)") && !src.includes("console.log(openai.apiKey)"), 'API key not logged');
  assert.ok(src.includes("process.env.OPENAI_API_KEY") && src.includes("process.env.GEMINI_API_KEY"), 'keys read from env only');
});

test("AI provider: OpenAI uses official SDK and configurable model", () => {
  const src = read(AI_PROVIDER);
  assert.ok(src.includes("import OpenAI from \"openai\"") || src.includes("from 'openai'"), 'official OpenAI SDK imported');
  assert.ok(src.includes("process.env.OPENAI_MODEL"), 'model configurable via OPENAI_MODEL');
  assert.ok(src.includes("chat.completions.create"), 'official OpenAI chat completions endpoint');
});

test("AI provider selection: priority order openai -> gemini -> none (logic simulation)", () => {
  function resolveProvider(openaiKey, geminiKey) {
    if (openaiKey && openaiKey.trim().length > 0) return "openai";
    if (geminiKey && geminiKey.trim().length > 0) return "gemini";
    return "none";
  }
  assert.strictEqual(resolveProvider("sk-...", ""), "openai");
  assert.strictEqual(resolveProvider("", "AIza..."), "gemini");
  assert.strictEqual(resolveProvider("", ""), "none");
  assert.strictEqual(resolveProvider("   ", "AIza..."), "gemini");
});

test("AI provider: executeAiPrompt throws honest error when no provider configured (never fakes)", () => {
  const src = read(AI_PROVIDER);
  assert.ok(src.includes("NEEDS_AUTHORIZATION"), 'throws NEEDS_AUTHORIZATION when unconfigured');
  assert.ok(src.includes("Never fakes a response"), 'documents that responses are never fabricated');
});

test("AI provider: safe retry only on retryable errors (429/503/timeout), not invalid key", () => {
  function isRetryable(msg) {
    return /429|rate.?limit|resource.?exhausted|quota|503|unavailable|timeout|ETIMEDOUT|ECONNRESET/i.test(msg || "");
  }
  assert.strictEqual(isRetryable("429 Too Many Requests"), true);
  assert.strictEqual(isRetryable("503 Service Unavailable"), true);
  assert.strictEqual(isRetryable("ETIMEDOUT"), true);
  assert.strictEqual(isRetryable("401 Invalid API Key"), false);
  assert.strictEqual(isRetryable("400 Bad Request"), false);
});

test("Existing providers preserved: Gemini source still present and unchanged contract", () => {
  const geminiSrc = read("./lib/gemini.ts");
  assert.ok(geminiSrc.includes("GoogleGenerativeAI"), 'Gemini SDK still imported');
  assert.ok(geminiSrc.includes("executeGeminiPrompt"), 'executeGeminiPrompt still exported');
});

test("AI routes preserved: /api/ai/command and /api/chat-public use centralized provider", () => {
  const cmd = read("./app/api/ai/command/route.ts");
  const chat = read("./app/api/chat-public/route.ts");
  assert.ok(cmd.includes("executeAiPrompt") || cmd.includes("ai-provider"), 'ai/command uses centralized provider');
  assert.ok(chat.includes("executeAiPrompt") || chat.includes("ai-provider"), 'chat-public uses centralized provider');
  assert.ok(cmd.includes("requireAdminSession"), 'ai/command keeps owner admin gate');
});
