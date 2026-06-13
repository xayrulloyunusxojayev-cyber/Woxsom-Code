import { callGroq, GroqAuthError, hasGroqKeys } from "./groq";
import { messageDb, sessionDb, projectDb, type ProjectFile } from "./db";
import { selectModelForTask } from "./models";
import { logger } from "./logger";

export interface PipelineState {
  sessionId: string;
  status: "idle" | "planning" | "executing" | "reviewing" | "done" | "error" | "needs_keys";
  currentStep: string | null;
  progress: number;
  agents: AgentState[];
}

export interface AgentState {
  name: string;
  group: "A" | "B" | "C";
  status: "idle" | "active" | "done" | "error";
  model: string | null;
  task: string | null;
}

const pipelines = new Map<string, PipelineState>();

function defaultAgents(): AgentState[] {
  return [
    { name: "Planner", group: "A", status: "idle", model: null, task: null },
    { name: "Frontend Executor", group: "B", status: "idle", model: null, task: null },
    { name: "Backend Executor", group: "B", status: "idle", model: null, task: null },
    { name: "Critic", group: "C", status: "idle", model: null, task: null },
    { name: "Optimizer", group: "C", status: "idle", model: null, task: null },
  ];
}

export function getPipelineStatus(sessionId: string): PipelineState {
  return pipelines.get(sessionId) ?? {
    sessionId,
    status: "idle",
    currentStep: null,
    progress: 0,
    agents: defaultAgents(),
  };
}

function updatePipeline(sessionId: string, updates: Partial<PipelineState>): void {
  const current = getPipelineStatus(sessionId);
  pipelines.set(sessionId, { ...current, ...updates });
}

function updateAgent(sessionId: string, agentName: string, updates: Partial<AgentState>): void {
  const state = getPipelineStatus(sessionId);
  const agents = state.agents.map((a) =>
    a.name === agentName ? { ...a, ...updates } : a
  );
  pipelines.set(sessionId, { ...state, agents });
}

function addSystemMessage(sessionId: string, content: string, role: string, agentName: string): void {
  messageDb.add(sessionId, role, content, agentName);
}

/**
 * Truncate a string to a maximum number of characters, appending an indicator
 * if truncated. This prevents context explosion when passing one agent's output
 * to the next stage.
 */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n\n[...truncated — ${text.length - maxChars} chars omitted for context budget]`;
}

const COT_INSTRUCTION = `You are a focused agent. Complete ONLY your assigned task in this message. Do not jump ahead to other stages. Think step by step before writing any output. Output your reasoning first, then your result.`;

export async function runAgentPipeline(sessionId: string, userPrompt: string): Promise<void> {
  // ─── PRE-FLIGHT: check for API keys before doing anything ─────────────────
  if (!hasGroqKeys()) {
    updatePipeline(sessionId, {
      status: "needs_keys",
      currentStep: "No API keys configured",
      progress: 0,
      agents: defaultAgents(),
    });
    sessionDb.updateStatus(sessionId, "needs_keys");
    addSystemMessage(
      sessionId,
      `**API Keys Required**\n\nNo Groq API keys are configured. The agent pipeline cannot start.\n\nPlease go to **API Keys** in the sidebar, add your Groq API key(s), then start a new session.\n\nGet free keys at [console.groq.com/keys](https://console.groq.com/keys).`,
      "system",
      "System"
    );
    logger.warn({ sessionId }, "Pipeline aborted — no API keys configured");
    return;
  }

  const plannerModel = selectModelForTask("planning");
  const frontendModel = selectModelForTask("frontend");
  const backendModel = selectModelForTask("backend");
  const reviewModel = selectModelForTask("review");
  const securityModel = selectModelForTask("security");

  updatePipeline(sessionId, {
    status: "planning",
    currentStep: "Planner decomposing project",
    progress: 5,
    agents: defaultAgents(),
  });
  sessionDb.updateStatus(sessionId, "planning");

  try {
    // ─── GROUP A: PLANNER ────────────────────────────────────────────────────
    console.log(`--- [${sessionId}] Starting Planner Stage ---`);
    logger.info({ sessionId, model: plannerModel }, "Group A: Planner starting");

    updateAgent(sessionId, "Planner", {
      status: "active",
      model: plannerModel,
      task: "Decomposing project and selecting tech stack",
    });

    const plannerResult = await callGroq(
      plannerModel,
      [
        {
          role: "system",
          content: `${COT_INSTRUCTION}

You are the Planner agent in a multi-agent AI coding system called Woxsom Code.
Your ONLY task right now is to produce a structured project plan. Do not write any code.

Step 1 — Analyze the request and identify key requirements.
Step 2 — Choose the optimal tech stack.
Step 3 — Break the project into tasks for Frontend and Backend executors.
Step 4 — Output the plan in the JSON format below.

Output a structured JSON plan with:
- projectName: string
- description: string
- techStack: { frontend: string[], backend: string[], database: string, deployment: string }
- tasks: Array<{ id: string, title: string, type: "frontend"|"backend"|"both", priority: "high"|"medium"|"low", description: string }>
- frontendSpec: string (detailed spec for the Frontend Executor — what screens, components, and interactions to build)
- backendSpec: string (detailed spec for the Backend Executor — what endpoints, models, and logic to build)
- fileStructure: string (expected project file tree)

Be concise but complete. Executors will follow your plan exactly.`,
        },
        {
          role: "user",
          content: `Build this project: ${userPrompt}`,
        },
      ],
      { maxTokens: 2000, temperature: 0.3 }
    );

    updateAgent(sessionId, "Planner", { status: "done" });
    addSystemMessage(
      sessionId,
      `**Planner Analysis Complete**\n\n${plannerResult}`,
      "planner",
      "Planner"
    );
    updatePipeline(sessionId, { progress: 25, currentStep: "Executors building in parallel" });
    sessionDb.updateStatus(sessionId, "executing");

    // ─── GROUP B: PARALLEL EXECUTORS ─────────────────────────────────────────
    console.log(`--- [${sessionId}] Starting Execution Stage (Frontend + Backend in parallel) ---`);
    logger.info({ sessionId }, "Group B: Executors starting in parallel");

    updateAgent(sessionId, "Frontend Executor", {
      status: "active",
      model: frontendModel,
      task: "Generating frontend code and UI components",
    });
    updateAgent(sessionId, "Backend Executor", {
      status: "active",
      model: backendModel,
      task: "Generating backend API and business logic",
    });

    const planContext = truncate(plannerResult, 3000);

    const [frontendResult, backendResult] = await Promise.all([
      callGroq(
        frontendModel,
        [
          {
            role: "system",
            content: `${COT_INSTRUCTION}

You are the Frontend Executor agent in Woxsom Code.
Your ONLY task right now is to generate the frontend source files based on the plan below. Do not write backend code.

Step 1 — Read the frontendSpec from the plan carefully.
Step 2 — List the files you will create.
Step 3 — Write each file completely.

Output each file in this exact format:
\`\`\`filepath:src/App.tsx
// full file content here
\`\`\`

Write complete, working TypeScript/React code. No placeholders, no TODO comments.`,
          },
          {
            role: "user",
            content: `Project plan:\n\n${planContext}\n\nOriginal request: ${userPrompt}\n\nGenerate all frontend files now.`,
          },
        ],
        { maxTokens: 3500, temperature: 0.4 }
      ),

      callGroq(
        backendModel,
        [
          {
            role: "system",
            content: `${COT_INSTRUCTION}

You are the Backend Executor agent in Woxsom Code.
Your ONLY task right now is to generate the backend source files based on the plan below. Do not write frontend code.

Step 1 — Read the backendSpec from the plan carefully.
Step 2 — List the files you will create.
Step 3 — Write each file completely.

Output each file in this exact format:
\`\`\`filepath:server/index.ts
// full file content here
\`\`\`

Write complete, working TypeScript code with proper error handling. No placeholders, no TODO comments.`,
          },
          {
            role: "user",
            content: `Project plan:\n\n${planContext}\n\nOriginal request: ${userPrompt}\n\nGenerate all backend files now.`,
          },
        ],
        { maxTokens: 3500, temperature: 0.4 }
      ),
    ]);

    updateAgent(sessionId, "Frontend Executor", { status: "done" });
    updateAgent(sessionId, "Backend Executor", { status: "done" });

    addSystemMessage(
      sessionId,
      `**Frontend Executor Output**\n\n${frontendResult}`,
      "executor_frontend",
      "Frontend Executor"
    );
    addSystemMessage(
      sessionId,
      `**Backend Executor Output**\n\n${backendResult}`,
      "executor_backend",
      "Backend Executor"
    );

    updatePipeline(sessionId, { progress: 65, currentStep: "Critic reviewing code quality" });
    sessionDb.updateStatus(sessionId, "reviewing");

    // ─── GROUP C — STEP 1: CRITIC ─────────────────────────────────────────────
    console.log(`--- [${sessionId}] Starting Critic Stage ---`);
    logger.info({ sessionId, model: reviewModel }, "Group C: Critic starting");

    updateAgent(sessionId, "Critic", {
      status: "active",
      model: reviewModel,
      task: "Reviewing code quality and correctness",
    });

    const frontendContext = truncate(frontendResult, 2500);
    const backendContext = truncate(backendResult, 2500);

    const criticResult = await callGroq(
      reviewModel,
      [
        {
          role: "system",
          content: `${COT_INSTRUCTION}

You are the Critic agent in Woxsom Code.
Your ONLY task right now is to review the generated code for bugs and missing functionality.

Step 1 — Check the frontend code for bugs, missing types, and UI issues.
Step 2 — Check the backend code for bugs, missing routes, and security issues.
Step 3 — List all issues found with severity (critical / warning / suggestion).
Step 4 — Output corrected files for any critical issues only.

Use this format for corrected files:
\`\`\`filepath:src/fixed-file.tsx
// corrected content
\`\`\`

End your response with: **Quality Score: N/100** where N reflects the overall quality.`,
        },
        {
          role: "user",
          content: `FRONTEND CODE:\n${frontendContext}\n\n---\n\nBACKEND CODE:\n${backendContext}\n\n---\n\nOriginal request: ${userPrompt}\n\nReview the code now.`,
        },
      ],
      { maxTokens: 2500, temperature: 0.2 }
    );

    updateAgent(sessionId, "Critic", { status: "done" });
    addSystemMessage(
      sessionId,
      `**Critic Review**\n\n${criticResult}`,
      "critic",
      "Critic"
    );

    updatePipeline(sessionId, { progress: 82, currentStep: "Optimizer finalizing project" });

    // ─── GROUP C — STEP 2: OPTIMIZER ─────────────────────────────────────────
    console.log(`--- [${sessionId}] Starting Optimizer Stage ---`);
    logger.info({ sessionId, model: securityModel }, "Group C: Optimizer starting");

    updateAgent(sessionId, "Optimizer", {
      status: "active",
      model: securityModel,
      task: "Adding config files and packaging project",
    });

    const criticContext = truncate(criticResult, 1500);

    const optimizerResult = await callGroq(
      securityModel,
      [
        {
          role: "system",
          content: `${COT_INSTRUCTION}

You are the Optimizer agent in Woxsom Code.
Your ONLY task right now is to add the missing configuration files that make the project runnable.

Step 1 — Review the critic's issues summary.
Step 2 — Generate ONLY the configuration and setup files listed below.
Step 3 — Do not rewrite application code already generated by the executors.

You MUST generate these files (if not already present in the executor output):
- package.json (with all correct dependencies)
- tsconfig.json
- .gitignore
- README.md (with setup and run instructions)
- .env.example
- .vscode/settings.json

Use this format:
\`\`\`filepath:package.json
{ ... }
\`\`\``,
        },
        {
          role: "user",
          content: `Critic review summary:\n${criticContext}\n\n---\n\nProject: ${userPrompt}\n\nGenerate the configuration files now.`,
        },
      ],
      { maxTokens: 2000, temperature: 0.2 }
    );

    updateAgent(sessionId, "Optimizer", { status: "done" });
    addSystemMessage(
      sessionId,
      `**Optimizer Output — Project Finalized**\n\n${optimizerResult}`,
      "critic",
      "Optimizer"
    );

    updatePipeline(sessionId, { progress: 90, currentStep: "Packaging project files" });

    // ─── EXTRACT & SAVE PROJECT FILES ────────────────────────────────────────
    console.log(`--- [${sessionId}] Extracting and saving project files ---`);
    const allCode = `${frontendResult}\n\n${backendResult}\n\n${criticResult}\n\n${optimizerResult}`;
    const files = extractProjectFiles(allCode);

    if (files.length > 0) {
      projectDb.saveFiles(sessionId, files);
    } else {
      projectDb.saveFiles(sessionId, [
        {
          filePath: "README.md",
          content: `# Generated Project\n\n${truncate(plannerResult, 2000)}\n\n## Files\n\nSee the full output in the chat above for all generated code.\n`,
        },
      ]);
    }

    const finalMessage = `**Project Complete!** ${files.length} files generated and ready for download.\n\nClick the **Download Project** button above to get your ZIP file with all code, configuration, and VS Code settings.`;
    addSystemMessage(sessionId, finalMessage, "assistant", "Woxsom Code");

    updatePipeline(sessionId, {
      status: "done",
      currentStep: null,
      progress: 100,
    });
    sessionDb.updateStatus(sessionId, "done");

    console.log(`--- [${sessionId}] Pipeline completed successfully — ${files.length} files ---`);
    logger.info({ sessionId, fileCount: files.length }, "Pipeline completed successfully");

  } catch (err) {
    const error = err as Error;
    const isAuthError = err instanceof GroqAuthError;
    logger.error({ sessionId, error: error.message, isAuthError }, "Pipeline error");
    console.error(`--- [${sessionId}] Pipeline error: ${error.message} ---`);

    pipelines.get(sessionId)?.agents.forEach((a) => {
      if (a.status === "active") {
        updateAgent(sessionId, a.name, { status: "error" });
      }
    });

    if (isAuthError) {
      updatePipeline(sessionId, {
        status: "needs_keys",
        currentStep: "API key rejected — please update keys in API Keys page",
        progress: 0,
      });
      sessionDb.updateStatus(sessionId, "needs_keys");
      addSystemMessage(
        sessionId,
        `**Authentication Error**\n\n${error.message}\n\nYour Groq API key was rejected. Go to **API Keys** in the sidebar, delete the current key and add a valid one, then start a new session.`,
        "system",
        "System"
      );
    } else {
      updatePipeline(sessionId, {
        status: "error",
        currentStep: `Error: ${error.message}`,
        progress: 0,
      });
      sessionDb.updateStatus(sessionId, "error");
      addSystemMessage(
        sessionId,
        `**Pipeline Error**\n\n${error.message}\n\nPlease check your API keys and try again.`,
        "system",
        "System"
      );
    }
  }
}

function extractProjectFiles(text: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  const seen = new Set<string>();

  const regex = /```(?:filepath:|path:)?([^\n`]+)\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const rawPath = match[1].trim();
    const content = match[2];

    if (!rawPath || (rawPath.includes(" ") && !rawPath.includes("/"))) continue;

    const cleanPath = rawPath
      .replace(/^(filepath:|path:)/, "")
      .trim()
      .replace(/^\//, "");

    if (!cleanPath || cleanPath.length < 2) continue;
    if (seen.has(cleanPath)) continue;

    seen.add(cleanPath);
    files.push({ filePath: cleanPath, content });
  }

  return files;
}
