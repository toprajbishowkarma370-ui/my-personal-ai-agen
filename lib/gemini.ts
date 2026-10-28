import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY; // SERVER ONLY

class GeminiQueue {
  private queue: (() => Promise<any>)[] = [];
  private running = false;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await fn();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    const task = this.queue.shift();
    if (task) {
      try {
        await task();
      } catch (e) {
        // Handled in promise rejection
      }
    }
    this.running = false;
    this.process();
  }
}

const geminiQueue = new GeminiQueue();

export async function executeGeminiPrompt(prompt: string, systemContext?: string): Promise<string> {
  if (!apiKey) throw new Error("NEEDS_AUTHORIZATION: GEMINI_API_KEY environment variable is not configured on the server.");
  
  // Reduce unnecessary conversation history and oversized prompts while preserving essential task context
  const trimmedPrompt = prompt.length > 8000 ? prompt.substring(0, 8000) + "\n[Truncated for quota optimization]" : prompt;
  const trimmedContext = systemContext && systemContext.length > 2000 ? systemContext.substring(0, 2000) : systemContext;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-1.5-flash" });
  const fullPrompt = trimmedContext ? trimmedContext + "\n\n" + trimmedPrompt : trimmedPrompt;

  const maxRetries = 3;
  let attempt = 0;

  return geminiQueue.add(async () => {
    while (attempt <= maxRetries) {
      try {
        const result = await model.generateContent(fullPrompt);
        // @ts-ignore
        const text = result?.response?.text?.() || String(result);
        return text;
      } catch (err: any) {
        const errStr = String(err?.message || err);
        const isRateLimit = errStr.includes("429") || errStr.toLowerCase().includes("resource exhausted") || errStr.toLowerCase().includes("quota") || errStr.includes("503");
        
        if (isRateLimit && attempt < maxRetries) {
          attempt++;
          // Exponential backoff with jitter: 2^attempt * 1500 + random(0-500ms)
          const delay = Math.min(Math.pow(2, attempt) * 1500 + Math.random() * 500, 15000);
          console.warn(`[Gemini] Rate limit (429/503) encountered. Attempt ${attempt}/${maxRetries}. Retrying in ${Math.round(delay)}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (isRateLimit) {
          throw new Error(`Gemini API rate limit (HTTP 429 / Quota Exceeded) reached after ${maxRetries} retries. Please wait 30 seconds before retrying, or reduce request size.`);
        }
        throw err;
      }
    }
    throw new Error("Gemini API rate limit exceeded.");
  });
}
