export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}

const MAX_ENTRIES = 500;
let nextId = 1;
const ring: LogEntry[] = [];

export function appendLog(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  ring.push({
    id: nextId++,
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  });
  if (ring.length > MAX_ENTRIES) ring.shift();
}

export function getRecentLogs(limit = 150): LogEntry[] {
  return ring.slice(-limit);
}

appendLog("info", "System log store initialized");
