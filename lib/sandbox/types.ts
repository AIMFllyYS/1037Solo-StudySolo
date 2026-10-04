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
  /** Explicit rejection before any provider effect; never an uncertain outcome. */
  authenticationBlocked?: boolean;
  /** UI retry precondition only; never a credential or model authority. */
  ownerBinding?: string;
  retryId?: string;
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
  recordType?: "execution-command";
  id: string;
  owner: string;
  sessionId: string;
  state: "starting" | "running" | "completed" | "cancelled" | "uncertain";
  pid?: number;
  createdAt: number;
  expiresAt: number;
  result?: { state: string; stdout: string; stderr: string; exitCode?: number; reason?: string };
}
export interface SandboxAuthRetry {
  recordType: "auth-retry";
  id: string;
  owner: string;
  conversationId: string;
  input: SandboxInput;
  state: "proposed" | "started" | "completed" | "uncertain";
  createdAt: number;
  expiresAt: number;
  output?: SandboxOutput;
}
/** Legacy command records have no discriminator; tickets are never commands. */
export function isExecutionCommand(record: SandboxCommand | SandboxAuthRetry): record is SandboxCommand {
  return (record.recordType === undefined || record.recordType === "execution-command") && "sessionId" in record && typeof record.sessionId === "string";
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
  /** Missing state/hash identifies a legacy, already published manifest. */
  state?: "pending" | "uncertain" | "ready";
  contentHash?: string;
}
