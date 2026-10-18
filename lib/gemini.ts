import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY; // SERVER ONLY

export async function executeGeminiPrompt(prompt: string, systemContext?: string): Promise<string> {
  if (!apiKey) throw new Error("NEEDS_AUTHORIZATION: GEMINI_API_KEY environment variable is not configured on the server.");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const fullPrompt = systemContext ? systemContext + "\n\n" + prompt : prompt;
  const result = await model.generateContent(fullPrompt);
  // result.response may differ depending on package - guard access
  // Return string safely
  // @ts-ignore
  return result?.response?.text?.() || String(result);
}
