import { callGroq } from "./groq";
import { messageDb, sessionDb, projectDb, type ProjectFile } from "./db";
import { selectModelForTask } from "./models";
import { logger } from "./logger";

export interface PipelineState {
  sessionId: string;
  status: "idle" | "planning" | "executing" | "reviewing" | "done" | "error";
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

export async function runAgentPipeline(sessionId: string, userPrompt: string): Promise<void> {
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
    updateAgent(sessionId, "Planner", {
      status: "active",
      model: plannerModel,
      task: "Decomposing project and selecting tech stack",
    });

    logger.info({ sessionId, model: plannerModel }, "Group A: Planner starting");

    const plannerResult = await callGroq(
      plannerModel,
      [
        {
          role: "system",
          content: `You are the Planner agent in a multi-agent AI coding system called Woxsom Code. 
Your job is to:
1. Analyze the user's request and decompose it into a clear project structure
2. Select the optimal tech stack
3. Define a development roadmap as Trello-style tasks
4. Provide clear specifications for the Frontend and Backend executor agents

Output a structured JSON plan with:
- projectName: string
- description: string  
- techStack: { frontend: string[], backend: string[], database: string, deployment: string }
- tasks: Array<{ id: string, title: string, type: "frontend"|"backend"|"both", priority: "high"|"medium"|"low", description: string }>
- frontendSpec: string (detailed spec for the Frontend Executor)
- backendSpec: string (detailed spec for the Backend Executor)
- fileStructure: string (expected project file tree)

Be thorough and practical. The executors will follow your plan exactly.`,
        },
        {
          role: "user",
          content: `Build this project: ${userPrompt}`,
        },
      ],
      { maxTokens: 3000, temperature: 0.4 }
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

    logger.info({ sessionId }, "Group B: Executors starting in parallel");

    const [frontendResult, backendResult] = await Promise.all([
      callGroq(
        frontendModel,
        [
          {
            role: "system",
            content: `You are the Frontend/UI Executor agent in Woxsom Code. You generate complete, production-ready frontend code.
Output actual file contents in this format:

\`\`\`filepath:src/App.tsx
// file content here
\`\`\`

Generate complete, functional code. Include all necessary files: components, pages, styles, configuration.
Focus on clean, modern UI with proper TypeScript types. Do not include placeholder comments — write real implementation.`,
          },
          {
            role: "user",
            content: `Frontend spec from Planner:\n\n${plannerResult}\n\nOriginal request: ${userPrompt}\n\nGenerate all frontend files.`,
          },
        ],
        { maxTokens: 4096, temperature: 0.5 }
      ),

      callGroq(
        backendModel,
        [
          {
            role: "system",
            content: `You are the Backend/AI Executor agent in Woxsom Code. You generate complete, production-ready backend code.
Output actual file contents in this format:

\`\`\`filepath:server/index.ts
// file content here
\`\`\`

Generate complete, functional code. Include all necessary files: API routes, database schema, middleware, configuration.
Focus on robust, secure implementation with proper error handling. Do not include placeholder comments — write real implementation.`,
          },
          {
            role: "user",
            content: `Backend spec from Planner:\n\n${plannerResult}\n\nOriginal request: ${userPrompt}\n\nGenerate all backend files.`,
          },
        ],
        { maxTokens: 4096, temperature: 0.5 }
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

    updatePipeline(sessionId, { progress: 65, currentStep: "Critics reviewing and optimizing" });
    sessionDb.updateStatus(sessionId, "reviewing");

    // ─── GROUP C: CRITIC / OPTIMIZER ─────────────────────────────────────────
    updateAgent(sessionId, "Critic", {
      status: "active",
      model: reviewModel,
      task: "Reviewing code quality and correctness",
    });
    updateAgent(sessionId, "Optimizer", {
      status: "active",
      model: securityModel,
      task: "Security audit and performance optimization",
    });

    logger.info({ sessionId }, "Group C: Critics starting");

    const [criticResult, optimizerResult] = await Promise.all([
      callGroq(
        reviewModel,
        [
          {
            role: "system",
            content: `You are the Critic agent in Woxsom Code. You review generated code for:
1. Bugs and logical errors
2. Missing functionality from the spec
3. Code quality and best practices
4. Type safety and proper error handling

Provide:
- A summary of issues found
- Corrected/improved file contents in the \`\`\`filepath:...\`\`\` format for any files that need changes
- A final quality score (0-100)

If code is good, still output the final merged file structure with all corrections applied.`,
          },
          {
            role: "user",
            content: `Review this generated project:\n\nPLAN:\n${plannerResult}\n\nFRONTEND CODE:\n${frontendResult}\n\nBACKEND CODE:\n${backendResult}\n\nOriginal request: ${userPrompt}`,
          },
        ],
        { maxTokens: 4096, temperature: 0.3 }
      ),

      callGroq(
        securityModel,
        [
          {
            role: "system",
            content: `You are the Optimizer/Security agent in Woxsom Code. You:
1. Check for security vulnerabilities (XSS, injection, auth issues)
2. Optimize performance bottlenecks
3. Add missing configuration files (.gitignore, package.json, tsconfig.json, README.md, .env.example, .vscode/settings.json)
4. Package the final project with VS Code integration

Output the final complete file set including ALL configuration files needed to run the project.
Use the format: \`\`\`filepath:filename\`\`\` for each file.
Always include: package.json, tsconfig.json, .gitignore, README.md, .env.example, .vscode/settings.json`,
          },
          {
            role: "user",
            content: `Optimize and finalize this project:\n\nPLAN:\n${plannerResult}\n\nFRONTEND:\n${frontendResult}\n\nBACKEND:\n${backendResult}\n\nCRITIC REVIEW:\n${criticResult}`,
          },
        ],
        { maxTokens: 4096, temperature: 0.3 }
      ),
    ]);

    updateAgent(sessionId, "Critic", { status: "done" });
    updateAgent(sessionId, "Optimizer", { status: "done" });

    addSystemMessage(
      sessionId,
      `**Critic Review**\n\n${criticResult}`,
      "critic",
      "Critic"
    );
    addSystemMessage(
      sessionId,
      `**Optimizer Output — Project Finalized**\n\n${optimizerResult}`,
      "critic",
      "Optimizer"
    );

    updatePipeline(sessionId, { progress: 90, currentStep: "Packaging project files" });

    // ─── EXTRACT & SAVE PROJECT FILES ────────────────────────────────────────
    const allCode = `${frontendResult}\n\n${backendResult}\n\n${criticResult}\n\n${optimizerResult}`;
    const files = extractProjectFiles(allCode);

    if (files.length > 0) {
      projectDb.saveFiles(sessionId, files);
    } else {
      projectDb.saveFiles(sessionId, [
        {
          filePath: "README.md",
          content: `# Generated Project\n\n${plannerResult}\n\n## Files\n\nSee the full output in the chat above for all generated code.\n`,
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

    logger.info({ sessionId, fileCount: files.length }, "Pipeline completed successfully");
  } catch (err) {
    const error = err as Error;
    logger.error({ sessionId, error: error.message }, "Pipeline error");

    updatePipeline(sessionId, {
      status: "error",
      currentStep: `Error: ${error.message}`,
      progress: 0,
    });
    pipelines.get(sessionId)?.agents.forEach((a) => {
      if (a.status === "active") {
        updateAgent(sessionId, a.name, { status: "error" });
      }
    });

    sessionDb.updateStatus(sessionId, "error");
    addSystemMessage(
      sessionId,
      `**Pipeline Error**\n\n${error.message}\n\nPlease check your API keys in Settings and try again.`,
      "system",
      "System"
    );
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

    if (!rawPath || rawPath.includes(" ") && !rawPath.includes("/")) continue;

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
