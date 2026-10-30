import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

export type AiProvider = "openai" | "gemini" | "none";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1500;

/**
 * Resolve the AI provider to use, in priority order:
 * 1. OpenAI when OPENAI_API_KEY is configured
 * 2. Gemini when GEMINI_API_KEY is configured
 * 3. none (honest configuration error returned to caller)
 *
 * Provider selection is read only from server-side environment variables.
 * API keys are never returned, logged, or exposed to the frontend.
 */
export function resolveAiProvider(): AiProvider {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0) {
    return "openai";
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
    return "gemini";
  }
  return "none";
}

export function getConfiguredProviderLabel(): string {
  const p = resolveAiProvider();
  if (p === "openai") return "openai";
  if (p === "gemini") return "gemini";
  return "none";
}

export function aiRequiresConfiguration(): boolean {
  return resolveAiProvider() === "none";
}

function isRetryableError(err: any): boolean {
  const msg = String(err?.message || err);
  return (
    /429|rate.?limit|resource.?exhausted|quota|503|unavailable|timeout|ETIMEDOUT|ECONNRESET/i.test(msg)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSafeRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const retryable = isRetryableError(err) && attempt <= MAX_RETRIES;
      if (!retryable) {
        // Surface a provider-agnostic error; never leak raw secrets or stack details.
        throw new Error(`AI provider error (${label}): ${err?.message || String(err)}`);
      }
      const delay = Math.min(Math.pow(2, attempt) * RETRY_BASE_MS + Math.random() * 500, 15000);
      console.warn(`[AI:${label}] Retryable error on attempt ${attempt}/${MAX_RETRIES}. Retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
    }
  }
}

function trimPrompt(prompt: string, maxChars: number): string {
  return prompt.length > maxChars ? prompt.slice(0, maxChars) + "\n[Truncated for quota optimization]" : prompt;
}

/**
 * Execute a prompt using OpenAI (official SDK, server-side only).
 * Model: OPENAI_MODEL env, default "gpt-4o-mini".
 */
async function executeOpenAIPrompt(prompt: string, systemContext?: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("NEEDS_AUTHORIZATION: OPENAI_API_KEY environment variable is not configured on the server.");
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const openai = new OpenAI({ apiKey });

  const messages = [];
  if (systemContext) {
    messages.push({ role: "system", content: trimPrompt(systemContext, 2000) });
  }
  messages.push({ role: "user", content: trimPrompt(prompt, 8000) });

  return withSafeRetry("openai", async () => {
    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
    });
    const choice = completion.choices?.[0];
    return choice?.message?.content || "";
  });
}

/**
 * Execute a prompt using Gemini (existing provider preserved).
 */
async function executeGeminiPromptInternal(prompt: string, systemContext?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("NEEDS_AUTHORIZATION: GEMINI_API_KEY environment variable is not configured on the server.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-1.5-flash" });
  const fullPrompt = systemContext ? systemContext + "\n\n" + prompt : prompt;

  return withSafeRetry("gemini", async () => {
    const result = await model.generateContent(trimPrompt(fullPrompt, 8000));
    // @ts-ignore
    return result?.response?.text?.() || String(result);
  });
}

/**
 * Centralized AI prompt execution.
 * Provider priority: OpenAI -> Gemini -> honest error.
 * Never fakes a response. Returns plain text.
 */
export async function executeAiPrompt(prompt: string, systemContext?: string): Promise<string> {
  if (!prompt || typeof prompt !== "string") {
    throw new Error("AI prompt is required");
  }

  const provider = resolveAiProvider();

  if (provider === "openai") {
    return executeOpenAIPrompt(prompt, systemContext);
  }

  if (provider === "gemini") {
    return executeGeminiPromptInternal(prompt, systemContext);
  }

  throw new Error(
    "NEEDS_AUTHORIZATION: No AI provider is configured on the server. Set OPENAI_API_KEY (recommended) or GEMINI_API_KEY in Render Environment variables to enable live AI generation."
  );
}
