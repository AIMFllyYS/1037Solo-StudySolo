export const CONNECTOR_IDS = ["notion", "todoist", "google", "github", "zotero", "pubmed", "crossref", "anki"] as const;
export type ConnectorId = typeof CONNECTOR_IDS[number];
export type OAuthConnectorId = "notion" | "todoist" | "google" | "github" | "zotero";
export const CONNECTOR_REGISTRY = {
  notion: { name: "Notion", kind: "mcp", auth: "oauth2", endpoint: "https://mcp.notion.com/mcp", capabilities: ["notes", "references"], writable: true },
  todoist: { name: "Todoist", kind: "mcp", auth: "oauth2", endpoint: "https://ai.todoist.net/mcp", capabilities: ["tasks", "study-plans"], writable: true },
  google: { name: "Google Drive / Calendar / Gmail / Contacts", kind: "api", auth: "oauth2", capabilities: ["files", "calendar", "mail", "contacts"], writable: true },
  github: { name: "GitHub", kind: "mcp", auth: "oauth2", endpoint: "https://api.githubcopilot.com/mcp/", capabilities: ["repositories", "issues", "pull-requests"], writable: false },
  zotero: { name: "Zotero", kind: "api", auth: "oauth1", capabilities: ["papers", "collections", "citations"], writable: false },
  pubmed: { name: "PubMed", kind: "api", auth: "public", capabilities: ["papers", "citations"], writable: false },
  crossref: { name: "Crossref", kind: "api", auth: "public", capabilities: ["doi", "citations"], writable: false },
  anki: { name: "Anki", kind: "export", auth: "local", capabilities: ["flashcard-export"], writable: false },
} as const;
export function connectorId(value: unknown): ConnectorId | null { return typeof value === "string" && CONNECTOR_IDS.includes(value as ConnectorId) ? value as ConnectorId : null; }
export function oauthConnectorId(value: unknown): OAuthConnectorId | null { const id = connectorId(value); return id && !["pubmed", "crossref", "anki"].includes(id) ? id as OAuthConnectorId : null; }

export interface ConnectorOperation { name: string; description: string; write: boolean; inputSchema: Record<string, unknown>; scope?: string }
export interface ConnectorConnectionStatus { provider: ConnectorId; name: string; kind: "mcp" | "api" | "export"; state: "available" | "connected" | "disconnected" | "reauthorization_required" | "unavailable"; writable: boolean; scopes?: string[]; canDisconnect?: boolean; grantVersion?: string; expiresAt?: number | null; error?: string }
export interface ConnectorResult { text: string; provider: ConnectorId; operation: string; data?: unknown; sourceUrls?: string[]; error?: string; action?: ExternalActionView; exportCardIds?: string[]; ownerBinding?: string; download?: { filename: string; content: string; mediaType: string } }
export interface ExternalActionView { id: string; provider: ConnectorId; operation: string; status: "proposed" | "executing" | "succeeded" | "failed" | "uncertain" | "cancelled"; arguments: Record<string, unknown>; expiresAt: number; result?: ConnectorResult; error?: string }
export interface LearningConnectorInput { action: "status" | "discover" | "read" | "propose" | "export"; provider?: ConnectorId; operation?: string; arguments?: Record<string, unknown>; cardIds?: string[] }
