import type { ComponentType } from "react";
import type { SubjectId } from "@/lib/types/content";

export interface InteractiveMeta {
  id: string;
  subjectId: SubjectId;
  chapterId: string;
  sectionId: string;
  title: string;
  description?: string;
  Component: ComponentType<Record<string, never>>;
}
