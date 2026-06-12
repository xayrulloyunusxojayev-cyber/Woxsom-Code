import { Router, type IRouter } from "express";
import { sessionDb, messageDb } from "../lib/db";
import { runAgentPipeline, getPipelineStatus } from "../lib/agents";

const router: IRouter = Router();

router.get("/sessions", async (_req, res): Promise<void> => {
  const sessions = sessionDb.list();
  res.json(sessions.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    messageCount: s.messageCount,
    status: s.status,
    hasProject: s.hasProject,
  })));
});

router.post("/sessions", async (req, res): Promise<void> => {
  const { title } = req.body as { title: string };
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const session = sessionDb.create(title.trim().slice(0, 100));
  res.status(201).json({
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: 0,
    status: session.status,
    hasProject: session.hasProject,
  });
});

router.get("/sessions/:sessionId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const session = sessionDb.get(raw);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    messages: session.messages.map((m) => ({
      id: m.id,
      sessionId: m.sessionId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      agentName: m.agentName,
      metadata: m.metadata,
    })),
    hasProject: session.hasProject,
    projectFiles: session.projectFiles,
  });
});

router.delete("/sessions/:sessionId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const deleted = sessionDb.delete(raw);
  if (!deleted) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ success: true, message: "Session deleted" });
});

router.post("/sessions/:sessionId/messages", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const session = sessionDb.get(raw);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const { content } = req.body as { content: string };
  if (content == null || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const currentStatus = sessionDb.list().find((s) => s.id === raw)?.status;
  if (currentStatus && ["planning", "executing", "reviewing"].includes(currentStatus)) {
    res.status(400).json({ error: "Pipeline is already running. Please wait for it to complete." });
    return;
  }

  if (session.messageCount === 0) {
    const titleFromPrompt = content.trim().slice(0, 50);
    sessionDb.updateTitle(raw, titleFromPrompt);
  }

  const userMessage = messageDb.add(raw, "user", content.trim());

  res.json({
    id: userMessage.id,
    sessionId: userMessage.sessionId,
    role: userMessage.role,
    content: userMessage.content,
    createdAt: userMessage.createdAt,
    agentName: null,
    metadata: null,
  });

  setImmediate(() => {
    runAgentPipeline(raw, content.trim()).catch((err) => {
      req.log.error({ err, sessionId: raw }, "Pipeline failed unexpectedly");
    });
  });
});

router.get("/sessions/:sessionId/status", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const state = getPipelineStatus(raw);
  res.json(state);
});

export default router;
