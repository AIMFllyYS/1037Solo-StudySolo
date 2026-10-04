/** Map server metadata to translated UI; never display provider response text. */
export function connectorErrorKey(code: string | null | undefined) {
  if (code === "ACCOUNT_CHANGED") return "trace.tool.learningConnectors.connectionAccountChanged";
  if (code === "SIGN_IN_REQUIRED" || code?.startsWith("SESSION_")) return "trace.tool.learningConnectors.signIn";
  if (code === "MFA_REQUIRED" || code === "REAUTH_REQUIRED") return "agent.market.connection.reauth";
  if (code === "ACCOUNT_UNAVAILABLE") return "agent.market.connection.accountUnavailable";
  if (code === "ACCOUNT_DISABLED") return "trace.tool.learningConnectors.accountDisabled";
  if (code === "EMAIL_UNVERIFIED") return "trace.tool.learningConnectors.emailUnverified";
  if (code === "CONNECTOR_PRODUCTION_DISABLED") return "agent.market.connection.productionDisabled";
  if (code === "ORIGIN_REJECTED") return "agent.market.connection.originRejected";
  if (code === "OAUTH_CANCELLED") return "trace.tool.learningConnectors.authorizationCancelled";
  if (code === "GOOGLE_SCOPE_REQUIRED" || code === "UNAPPROVED_GOOGLE_SCOPE") return "trace.tool.learningConnectors.selectApprovedScopes";
  if (code === "ZOTERO_APPLICATION_NOT_CONFIGURED" || code === "OAUTH_CLIENT_NOT_CONFIGURED" || code === "CONNECTOR_PREPARATION_FAILED" || code === "ZOTERO_PREPARATION_FAILED") return "trace.tool.learningConnectors.configurationRequired";
  if (code === "PROVIDER_RATE_LIMITED") return "trace.tool.learningConnectors.rateLimited";
  if (["OAUTH_STATE_INVALID", "OAUTH_ALREADY_CONSUMED", "OAUTH_OWNER_CHANGED", "OAUTH_CODE_INVALID", "OAUTH_VERIFIER_INVALID", "OAUTH_NOT_COMPLETED_RETRY_REQUIRED", "ZOTERO_OAUTH_FAILED"].includes(code ?? "")) return "trace.tool.learningConnectors.authorizationRetry";
  if (["REAUTHORIZATION_REQUIRED", "PROVIDER_AUTHORIZATION_EXPIRED", "CONNECTION_REQUIRED"].includes(code ?? "")) return "trace.tool.learningConnectors.reauth";
  return "trace.tool.learningConnectors.failed";
}
