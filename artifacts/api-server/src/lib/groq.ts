import { logger } from "./logger";

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqResponse {
  id: string;
  choices: {
    message: {
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/** Thrown when Groq rejects the API key (401/403). Distinct from other API errors. */
export class GroqAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroqAuthError";
  }
}

let keyPool: string[] = [];
let keyIndex = 0;
let keySource: "env" | "stored" | "none" = "none";

/**
 * Read GROQ_KEY_1 … GROQ_KEY_5 from process.env.
 * Call this first at startup; if keys are found they become the active pool
 * and the JSON store is ignored. Returns the count of env-provided keys.
 */
export function loadEnvKeys(): number {
  const envKeys: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const k = process.env[`GROQ_KEY_${i}`];
    if (k && k.trim().length > 0) envKeys.push(k.trim());
  }
  if (envKeys.length > 0) {
    keyPool = envKeys;
    keySource = "env";
    keyIndex = 0;
    logger.info({ count: envKeys.length }, "Loaded Groq API keys from environment variables");
  }
  return envKeys.length;
}

/** Load keys saved in the JSON file store (used when no env keys are present). */
export function setGroqKeys(keys: string[]): void {
  keyPool = keys.filter((k) => k && k.trim().length > 0);
  keyIndex = 0;
  keySource = keyPool.length > 0 ? "stored" : "none";
  logger.info({ count: keyPool.length }, "Groq API keys configured from store");
}

export function getGroqKeys(): string[] {
  return keyPool;
}

/** Returns where the active key pool came from: env vars, JSON store, or nothing. */
export function getKeySource(): "env" | "stored" | "none" {
  return keySource;
}

function nextKey(): string | null {
  if (keyPool.length === 0) return null;
  const key = keyPool[keyIndex % keyPool.length];
  keyIndex++;
  return key;
}

export async function callGroq(
  model: string,
  messages: GroqMessage[],
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const apiKey = nextKey();
  if (!apiKey) {
    throw new GroqAuthError(
      "No Groq API keys configured. Please add API keys in Settings."
    );
  }

  const { maxTokens = 4096, temperature = 0.7 } = options;

  logger.info({ model, keyIndex: (keyIndex - 1) % keyPool.length }, "Calling Groq API");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  // 401/403 = bad key — use typed error so the pipeline can handle it distinctly
  if (response.status === 401 || response.status === 403) {
    const errorText = await response.text().catch(() => "");
    logger.error({ status: response.status, model, error: errorText }, "Groq auth rejected");
    throw new GroqAuthError(
      `Groq rejected the API key (HTTP ${response.status}). Please update your keys in Settings.`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, model, error: errorText }, "Groq API error");
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as GroqResponse;
  const content = data.choices?.[0]?.message?.content ?? "";
  logger.info({ model, tokens: data.usage?.completion_tokens }, "Groq response received");
  return content;
}
