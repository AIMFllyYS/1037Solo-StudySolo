import { create } from 'zustand';
import type { ContextBreakdown } from '@/lib/types/chat';
import type { TokenUsage } from '@/lib/stores/chat/tokenTracker';
import { resolveSessionContextBudget } from '@/lib/context/estimateFullContext';

const EMPTY_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0 };

interface SessionTracker {
  sessionTotal: TokenUsage;
  lastTurn: TokenUsage;
  currentContextTokens: number;
  serverContextTokens: number;
  lastBreakdownTotal: number;
  modelContextLimit: number;
  sessionContextBudgetTokens: number;
  contextTruncated: boolean;
  contextWarning: string | null;
  lastRequestTime: number | null;
  contextBreakdown: ContextBreakdown | null;
}

function emptySession(): SessionTracker {
  return {
    sessionTotal: { ...EMPTY_USAGE },
    lastTurn: { ...EMPTY_USAGE },
    currentContextTokens: 0,
    serverContextTokens: 0,
    lastBreakdownTotal: 0,
    modelContextLimit: 128_000,
    sessionContextBudgetTokens: 0,
    contextTruncated: false,
    contextWarning: null,
    lastRequestTime: null,
    contextBreakdown: null,
  };
}

export interface FloatingTokenTrackerState {
  sessions: Record<string, SessionTracker>;

  getSession: (sessionId: string) => SessionTracker;
  addUsage: (sessionId: string, usage: Partial<TokenUsage>) => void;
  setCurrentContext: (sessionId: string, tokens: number, limit: number) => void;
  setContextBreakdown: (sessionId: string, breakdown: ContextBreakdown) => void;
  setContextWarning: (sessionId: string, truncated: boolean, warning?: string | null) => void;
  resetSession: (sessionId: string) => void;
}

export const useFloatingTokenTracker = create<FloatingTokenTrackerState>((set, get) => ({
  sessions: {},

  getSession(sessionId) {
    return get().sessions[sessionId] ?? emptySession();
  },

  addUsage(sessionId, usage) {
    set((s) => {
      const prev = s.sessions[sessionId] ?? emptySession();
      const turn: TokenUsage = {
        promptTokens: usage.promptTokens ?? 0,
        completionTokens: usage.completionTokens ?? 0,
        cachedTokens: usage.cachedTokens ?? 0,
        totalTokens: usage.totalTokens ?? ((usage.promptTokens ?? 0) + (usage.completionTokens ?? 0)),
      };
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...prev,
            lastTurn: turn,
            lastRequestTime: Date.now(),
            sessionTotal: {
              promptTokens: prev.sessionTotal.promptTokens + turn.promptTokens,
              completionTokens: prev.sessionTotal.completionTokens + turn.completionTokens,
              cachedTokens: prev.sessionTotal.cachedTokens + turn.cachedTokens,
              totalTokens: prev.sessionTotal.totalTokens + turn.totalTokens,
            },
          },
        },
      };
    });
  },

  setCurrentContext(sessionId, tokens, limit) {
    set((s) => {
      const prev = s.sessions[sessionId] ?? emptySession();
      const budget = resolveSessionContextBudget(prev.sessionContextBudgetTokens, limit);
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...prev,
            currentContextTokens: tokens,
            modelContextLimit: budget,
            sessionContextBudgetTokens: budget,
          },
        },
      };
    });
  },

  setContextBreakdown(sessionId, breakdown) {
    set((s) => {
      const prev = s.sessions[sessionId] ?? emptySession();
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...prev,
            contextBreakdown: breakdown,
            lastBreakdownTotal: breakdown.total,
            serverContextTokens: breakdown.total,
            currentContextTokens: breakdown.displayTotal ?? breakdown.total,
            contextTruncated: breakdown.truncated === true,
            contextWarning: breakdown.warning ?? null,
          },
        },
      };
    });
  },

  setContextWarning(sessionId, truncated, warning) {
    set((s) => {
      const prev = s.sessions[sessionId] ?? emptySession();
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...prev,
            contextTruncated: truncated,
            contextWarning: truncated ? (warning ?? null) : null,
          },
        },
      };
    });
  },

  resetSession(sessionId) {
    set((s) => {
      const next = { ...s.sessions };
      delete next[sessionId];
      return { sessions: next };
    });
  },
}));
