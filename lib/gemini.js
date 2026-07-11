import { GoogleGenerativeAI } from '@google/generative-ai';

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
    client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries on 503 (temporary overload) and 429 (rate limit) with exponential backoff.
// Falls back to a lighter model on the last attempt if the primary keeps failing.
export async function askGemini(prompt) {
  const genAI = getClient();
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  const maxAttemptsPerModel = 2;

  let lastError;
  for (const modelName of models) {
    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (err) {
        lastError = err;
        const isRetryable = /503|overloaded|high demand|429|rate limit/i.test(err.message || '');
        if (!isRetryable) throw err;
        await sleep(attempt * 1200); // 1.2s, then 2.4s before giving up on this model
      }
    }
  }
  throw new Error(`AI is temporarily unavailable, please try again in a moment. (${lastError?.message || 'unknown error'})`);
}
