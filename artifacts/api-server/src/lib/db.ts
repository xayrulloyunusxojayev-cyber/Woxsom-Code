import path from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger";
import { appendLog } from "./log-store";
import { DATA_DIR } from "./data-dir";

const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const PROJECT_FILES_FILE = path.join(DATA_DIR, "project_files.json");

const storageMode =
  process.env["RENDER"] === "true"
    ? "Render persistent disk (/var/data)"
    : process.env["DATA_DIR"]
      ? `custom DATA_DIR (${DATA_DIR})`
      : "local dev storage";

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export interface Session {
  id: string;
  title: string;
  status: string;
  hasProject: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface SessionDetail extends Session {
  messages: Message[];
  projectFiles: string[];
}

export interface Message {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  agentName: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface ProjectFile {
  filePath: string;
  content: string;
}

type SessionRecord = Omit<Session, "messageCount"> & { hasProject: boolean };
type MessageRecord = Message;
type ProjectFileRecord = { id: string; sessionId: string; filePath: string; content: string; createdAt: string };

function now(): string {
  return new Date().toISOString();
}

logger.info({ dataDir: DATA_DIR }, "JSON file store initialized");
appendLog("info", `JSON file store initialised — ${storageMode}`, { dataDir: DATA_DIR });

export const sessionDb = {
  list(): Session[] {
    const sessions = readJson<SessionRecord[]>(SESSIONS_FILE, []);
    const messages = readJson<MessageRecord[]>(MESSAGES_FILE, []);
    const countMap = messages.reduce<Record<string, number>>((acc, m) => {
      acc[m.sessionId] = (acc[m.sessionId] ?? 0) + 1;
      return acc;
    }, {});
    return sessions
      .map((s) => ({ ...s, messageCount: countMap[s.id] ?? 0 }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  create(title: string): Session {
    const sessions = readJson<SessionRecord[]>(SESSIONS_FILE, []);
    const id = uuidv4();
    const ts = now();
    const session: SessionRecord = { id, title, status: "idle", hasProject: false, createdAt: ts, updatedAt: ts };
    sessions.push(session);
    writeJson(SESSIONS_FILE, sessions);
    return { ...session, messageCount: 0 };
  },

  get(id: string): SessionDetail | null {
    const sessions = readJson<SessionRecord[]>(SESSIONS_FILE, []);
    const session = sessions.find((s) => s.id === id);
    if (!session) return null;

    const allMessages = readJson<MessageRecord[]>(MESSAGES_FILE, []);
    const messages = allMessages.filter((m) => m.sessionId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const allFiles = readJson<ProjectFileRecord[]>(PROJECT_FILES_FILE, []);
    const projectFiles = allFiles.filter((f) => f.sessionId === id).map((f) => f.filePath);

    return { ...session, messageCount: messages.length, messages, projectFiles };
  },

  delete(id: string): boolean {
    const sessions = readJson<SessionRecord[]>(SESSIONS_FILE, []);
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    sessions.splice(idx, 1);
    writeJson(SESSIONS_FILE, sessions);

    const messages = readJson<MessageRecord[]>(MESSAGES_FILE, []);
    writeJson(MESSAGES_FILE, messages.filter((m) => m.sessionId !== id));

    const files = readJson<ProjectFileRecord[]>(PROJECT_FILES_FILE, []);
    writeJson(PROJECT_FILES_FILE, files.filter((f) => f.sessionId !== id));

    return true;
  },

  updateStatus(id: string, status: string): void {
    const sessions = readJson<SessionRecord[]>(SESSIONS_FILE, []);
    const session = sessions.find((s) => s.id === id);
    if (session) {
      session.status = status;
      session.updatedAt = now();
      writeJson(SESSIONS_FILE, sessions);
    }
  },

  markHasProject(id: string): void {
    const sessions = readJson<SessionRecord[]>(SESSIONS_FILE, []);
    const session = sessions.find((s) => s.id === id);
    if (session) {
      session.hasProject = true;
      session.status = "done";
      session.updatedAt = now();
      writeJson(SESSIONS_FILE, sessions);
    }
  },

  updateTitle(id: string, title: string): void {
    const sessions = readJson<SessionRecord[]>(SESSIONS_FILE, []);
    const session = sessions.find((s) => s.id === id);
    if (session) {
      session.title = title;
      session.updatedAt = now();
      writeJson(SESSIONS_FILE, sessions);
    }
  },
};

export const messageDb = {
  add(sessionId: string, role: string, content: string, agentName?: string, metadata?: string): Message {
    const messages = readJson<MessageRecord[]>(MESSAGES_FILE, []);
    const id = uuidv4();
    const ts = now();
    const msg: MessageRecord = {
      id, sessionId, role, content,
      agentName: agentName ?? null,
      metadata: metadata ?? null,
      createdAt: ts,
    };
    messages.push(msg);
    writeJson(MESSAGES_FILE, messages);

    const sessions = readJson<SessionRecord[]>(SESSIONS_FILE, []);
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      session.updatedAt = ts;
      writeJson(SESSIONS_FILE, sessions);
    }
    return msg;
  },
};

export const projectDb = {
  saveFiles(sessionId: string, files: ProjectFile[]): void {
    const allFiles = readJson<ProjectFileRecord[]>(PROJECT_FILES_FILE, []);
    const filtered = allFiles.filter((f) => f.sessionId !== sessionId);
    const newFiles: ProjectFileRecord[] = files.map((f) => ({
      id: uuidv4(), sessionId, filePath: f.filePath, content: f.content, createdAt: now(),
    }));
    writeJson(PROJECT_FILES_FILE, [...filtered, ...newFiles]);
    sessionDb.markHasProject(sessionId);
  },

  getFiles(sessionId: string): ProjectFile[] {
    const allFiles = readJson<ProjectFileRecord[]>(PROJECT_FILES_FILE, []);
    return allFiles.filter((f) => f.sessionId === sessionId).map((f) => ({ filePath: f.filePath, content: f.content }));
  },
};
