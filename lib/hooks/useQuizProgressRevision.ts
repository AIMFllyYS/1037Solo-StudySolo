"use client";

import { useSyncExternalStore } from "react";
import { getQuizProgressVersion, subscribeQuizProgress } from "@/lib/quiz-progress";

export function useQuizProgressRevision(): number {
  return useSyncExternalStore(subscribeQuizProgress, getQuizProgressVersion, () => 0);
}
