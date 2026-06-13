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

/** Thrown when Groq rejects the API key (401/403) or no keys are configured. */
export class GroqAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroqAuthError";
  }
}

let keyPool: string[] = [];
let keyIndex = 0;

/** Load keys from the encrypted DB store (primary source of truth). */
export function setGroqKeys(keys: string[]): void {
  keyPool = keys.filter((k) => k && k.trim().length > 0);
  keyIndex = 0;
  logger.info({ count: keyPool.length }, "Groq API keys loaded into memory pool");
}

export function getGroqKeys(): string[] {
  return [...keyPool];
}

/** Returns whether keys are configured. */
export function hasGroqKeys(): boolean {
  return keyPool.length > 0;
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
