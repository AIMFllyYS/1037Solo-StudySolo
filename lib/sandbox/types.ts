export type SandboxAction = "status" | "open" | "exec" | "poll" | "write" | "read" | "list" | "cancel" | "close" | "publish";
export interface SandboxInput {
  action: SandboxAction;
  sessionId?: string;
  commandId?: string;
  command?: string;
  path?: string;
  content?: string;
  timeoutSeconds?: number;
}
export interface SandboxOutput {
  conversationId?: string;
  text: string;
  sessionId?: string;
  commandId?: string;
  state?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  reason?: string;
  logsTruncated?: boolean;
  entries?: { name: string; type: string; size: number }[];
  artifact?: { id: string; filename: string; size: number; downloadUrl: string };
  error?: string;
}
export interface SandboxSession {
  id: string;
  owner: string;
  conversationId: string;
  providerId?: string;
  configHash: string;
  createdAt: number;
  expiresAt: number;
  state: "creating" | "active" | "closing" | "closed" | "uncertain";
  reservedMicroCny: number;
}
export interface SandboxCommand {
  id: string;
  owner: string;
  sessionId: string;
  state: "starting" | "running" | "completed" | "cancelled" | "uncertain";
  pid?: number;
  createdAt: number;
  expiresAt: number;
  result?: { state: string; stdout: string; stderr: string; exitCode?: number; reason?: string };
}
export interface SandboxArtifact {
  id: string;
  owner: string;
  sessionId: string;
  filename: string;
  size: number;
  storagePath: string;
  createdAt: number;
  expiresAt?: number;
}
