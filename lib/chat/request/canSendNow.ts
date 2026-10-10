/** IndexedDB 水合/会话加载门控：未就绪时不得创建或覆盖会话。 */

export interface ChatSendGate {
  _hasHydrated: boolean;
  activeSessionId: string | null;
  messagesById: Record<string, unknown[] | undefined>;
  sessionLoadState: Record<string, string | undefined>;
}

export function canSendNow(history: ChatSendGate, ovSessionId?: string): boolean {
  if (!history._hasHydrated) return false;
  const existingSessionId = ovSessionId ?? history.activeSessionId;
  if (
    existingSessionId &&
    !history.messagesById[existingSessionId] &&
    history.sessionLoadState[existingSessionId] !== "loaded"
  ) {
    return false;
  }
  return true;
}
