export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getIndexHealth } = await import("./lib/ai/search/indexes/indexHealth");
  getIndexHealth();
  const { startExecutionMaintenance } = await import("./lib/sandbox/maintenance.server");
  startExecutionMaintenance();
}
