"use client";

import { useEffect, useMemo } from "react";
import { useAuthSession } from "@/lib/hooks/auth/useAuthSession";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useDocuments } from "@/lib/stores/assets/documents";
import { useArtifacts } from "@/lib/stores/assets/artifacts";
import { useImports } from "@/lib/stores/assets/imports";
import { useCloudRowKeys } from "@/lib/sync/status";
import { useCloudFileLibrary } from '@/lib/files/library';
import { buildAssetItems, type AssetItem } from "@/lib/agent/assetCatalog";
import { useClassroomAssets } from '@/lib/agent/classroomAssets';
import {useCloudAssetIndex} from '@/lib/assets/library';
import {useSyncItems} from '@/lib/sync/status';
import {useImageGen} from '@/lib/stores/assets/imageGen';
import {localSourceNeedsReconnect} from '@/lib/local-files/client';

/**
 * 「我的资产」的数据：把五类来源摊平成一张清单。
 * 任一来源还没水合就返回 null（页面显示骨架）——绝不用半份数据渲染出「东西丢了」的错觉。
 *
 * 同步角标读的是最近一次云端拉取的快照（lib/sync/status），没对过账就不显示。
 */
export function useAgentAssets(): AssetItem[] | null {
  const index=useCloudAssetIndex(),syncItems=useSyncItems();
  const images=useImageGen(state=>state.sessions);
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
    const items=buildAssetItems({
      images: Object.values(images),
      notes: noteOrder.map((id) => notesById[id]).filter(Boolean),
      cards: cardOrder.map((id) => cardsById[id]).filter(Boolean),
      documents: Object.values(docsById),
      artifacts: artifactOrder.map((id) => artifactsById[id]).filter(Boolean),
      imports: importOrder.map((id) => importsById[id]).filter(Boolean),
      cloudRow: (kind, id) => cloudRowKeys === null ? null : cloudRowKeys.has(`${kind}:${id}`),
      cloudFiles: files.files,
      classrooms: classrooms.owner === userId ? classrooms.rows : [],
    });
    const keys=new Set(items.map(item=>`${item.kind}:${item.id}`));
    for(const row of index.assets){
      const url=new URL(row.source_path,'https://studysolo.1037solo.com');
      const kind=row.source_type==='class-session'?'classroom':url.searchParams.get('kind') as AssetItem['kind']|null,id=row.source_type==='class-session'?row.source_id:url.searchParams.get('id');
      if(!kind||!id||!['note','flashcard','document','artifact','file','classroom','image'].includes(kind)||keys.has(`${kind}:${id}`))continue;
      items.push({id,kind,title:row.title,subtitle:'云端已保存',origin:'cloud',updatedAt:Date.parse(row.updated_at),meta:{cloudAssetId:row.id,sourcePath:row.source_path}});keys.add(`${kind}:${id}`);
    }
    return items.map(item=>{
      const kinds:Record<string,string>={note:'user-note',flashcard:'review-card',document:'document',artifact:'artifact',image:'image-gen'};
      const state=syncItems[`${kinds[item.kind]}:${item.id}`];
      const local=importsById[item.id];
      const incomplete=(item.kind==='image'&&images[item.id]&&images[item.id].status!=='done')||(item.kind==='document'&&docsById[item.id]&&docsById[item.id].status!=='done')||(item.kind==='artifact'&&artifactsById[item.id]&&artifactsById[item.id].status!=='done');
      const label=item.id.startsWith('conflict-')?'冲突副本':local?.localFileId?(localSourceNeedsReconnect(item.id)?'需要重连 · 仅本机':'仅本机'):incomplete?'未完成稿 · 仅本机':state?({pending:'待同步',syncing:'正在同步',synced:'已同步',blocked:'同步受阻',error:'同步失败',conflict:'存在冲突副本'} as const)[state.phase]:item.origin==='cloud'||item.origin==='both'?'云端存在此资产，版本待核对':'仅本机';
      return {...item,subtitle:`${item.subtitle} · ${label}`};
    });
  }, [
    classrooms,userId,files.files,cloudRowKeys,index.assets,syncItems,images,
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
