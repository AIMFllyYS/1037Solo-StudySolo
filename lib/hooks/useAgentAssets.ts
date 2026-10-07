"use client";

import { useEffect, useMemo } from "react";
import { useAuthSession } from "@/lib/hooks/useAuthSession";
import { useUserNotes } from "@/lib/stores/userNotes";
import { useReviewCards } from "@/lib/stores/reviewCards";
import { useDocuments } from "@/lib/stores/documents";
import { useArtifacts } from "@/lib/stores/artifacts";
import { useImports } from "@/lib/stores/imports";
import { useCloudRowKeys } from "@/lib/sync/status";
import { useCloudFileLibrary } from '@/lib/files/library';
import { buildAssetItems, type AssetItem } from "@/lib/agent/assetCatalog";
import { useClassroomAssets } from '@/lib/agent/classroomAssets';

/**
 * 「我的资产」的数据：把五类来源摊平成一张清单。
 * 任一来源还没水合就返回 null（页面显示骨架）——绝不用半份数据渲染出「东西丢了」的错觉。
 *
 * 同步角标读的是最近一次云端拉取的快照（lib/sync/status），没对过账就不显示。
 */
export function useAgentAssets(): AssetItem[] | null {
  const files = useCloudFileLibrary();
  const cloudRowKeys = useCloudRowKeys();
  const { userId } = useAuthSession();
  const classrooms = useClassroomAssets();
  const { owner: classroomOwner, phase: classroomPhase, refresh: refreshClassrooms } = classrooms;
  useEffect(() => { if (classroomOwner && classroomPhase === 'idle') void refreshClassrooms(); }, [classroomOwner, classroomPhase, refreshClassrooms]);
  const notesById = useUserNotes((s) => s.byId);
  const noteOrder = useUserNotes((s) => s.order);
  const notesReady = useUserNotes((s) => s._hasHydrated);
  const cardsById = useReviewCards((s) => s.byId);
  const cardOrder = useReviewCards((s) => s.order);
  const cardsReady = useReviewCards((s) => s._hasHydrated);
  const docsById = useDocuments((s) => s.byId);
  const docsReady = useDocuments((s) => s._hasHydrated);
  const artifactsById = useArtifacts((s) => s.byId);
  const artifactOrder = useArtifacts((s) => s.order);
  const artifactsReady = useArtifacts((s) => s._hasHydrated);
  const importsById = useImports((s) => s.byId);
  const importOrder = useImports((s) => s.order);
  const importsReady = useImports((s) => s._hasHydrated);

  return useMemo(() => {
    if (userId && classrooms.owner !== userId) return null;
    if (!notesReady || !cardsReady || !docsReady || !artifactsReady || !importsReady) return null;
    return buildAssetItems({
      notes: noteOrder.map((id) => notesById[id]).filter(Boolean),
      cards: cardOrder.map((id) => cardsById[id]).filter(Boolean),
      documents: Object.values(docsById),
      artifacts: artifactOrder.map((id) => artifactsById[id]).filter(Boolean),
      imports: importOrder.map((id) => importsById[id]).filter(Boolean),
      cloudRow: (kind, id) => cloudRowKeys === null ? null : cloudRowKeys.has(`${kind}:${id}`),
      cloudFiles: files.files,
      classrooms: classrooms.owner === userId ? classrooms.rows : [],
    });
  }, [
    classrooms,userId,files.files,cloudRowKeys,
    artifactOrder,
    artifactsById,
    artifactsReady,
    cardOrder,
    cardsById,
    cardsReady,
    docsById,
    docsReady,
    importOrder,
    importsById,
    importsReady,
    noteOrder,
    notesById,
    notesReady,
  ]);
}
