export interface ModelInfo {
  id: string;
  name: string;
  group: "reasoning" | "fast" | "specialized";
  capability: string;
  recommended: boolean;
}

export const MODELS: ModelInfo[] = [
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", group: "reasoning", capability: "General reasoning, planning, complex code generation", recommended: true },
  { id: "qwen/qwen3-32b", name: "Qwen3 32B", group: "reasoning", capability: "Advanced reasoning, code architecture, system design", recommended: true },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B", group: "reasoning", capability: "Efficient large-context reasoning and instruction following", recommended: false },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", group: "fast", capability: "Fast UI generation, quick scaffolding, boilerplate", recommended: true },
  { id: "groq/compound", name: "Groq Compound", group: "reasoning", capability: "Multi-step reasoning and compound task execution", recommended: false },
  { id: "groq/compound-mini", name: "Groq Compound Mini", group: "fast", capability: "Lightweight compound reasoning for fast iterations", recommended: false },
  { id: "openai/gpt-oss-120b", name: "GPT OSS 120B", group: "reasoning", capability: "Large-scale reasoning, complex system generation", recommended: false },
  { id: "openai/gpt-oss-20b", name: "GPT OSS 20B", group: "fast", capability: "Balanced performance for code review and optimization", recommended: false },
  { id: "openai/gpt-oss-safeguard-20b", name: "GPT OSS Safeguard 20B", group: "specialized", capability: "Security analysis and safe code generation", recommended: false },
  { id: "meta-llama/llama-prompt-guard-2-22b", name: "Llama Prompt Guard 2 22B", group: "specialized", capability: "Prompt injection detection and input validation", recommended: false },
  { id: "meta-llama/llama-prompt-guard-2-86b", name: "Llama Prompt Guard 2 86B", group: "specialized", capability: "Advanced security guard and injection prevention", recommended: false },
  { id: "whisper-large-v3", name: "Whisper Large V3", group: "specialized", capability: "Audio transcription and voice input processing", recommended: false },
  { id: "whisper-large-v3-turbo", name: "Whisper Large V3 Turbo", group: "specialized", capability: "Fast audio transcription", recommended: false },
  { id: "canopylabs/orpheus-arabic-saudi", name: "Orpheus Arabic Saudi", group: "specialized", capability: "Arabic language code generation and documentation", recommended: false },
  { id: "canopylabs/orpheus-v1-english", name: "Orpheus V1 English", group: "specialized", capability: "English language processing and text synthesis", recommended: false },
];

export const GROUP_A_MODEL = "llama-3.3-70b-versatile";
export const GROUP_B_FRONTEND_MODEL = "llama-3.1-8b-instant";
export const GROUP_B_BACKEND_MODEL = "qwen/qwen3-32b";
export const GROUP_C_CRITIC_1_MODEL = "llama-3.3-70b-versatile";
export const GROUP_C_CRITIC_2_MODEL = "openai/gpt-oss-20b";

export function selectModelForTask(task: "planning" | "frontend" | "backend" | "review" | "security"): string {
  switch (task) {
    case "planning": return GROUP_A_MODEL;
    case "frontend": return GROUP_B_FRONTEND_MODEL;
    case "backend": return GROUP_B_BACKEND_MODEL;
    case "review": return GROUP_C_CRITIC_1_MODEL;
    case "security": return GROUP_C_CRITIC_2_MODEL;
    default: return GROUP_A_MODEL;
  }
}
