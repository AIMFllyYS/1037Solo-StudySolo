"use client";

import { useEffect,useMemo,useState } from "react";
import {useAuthSession} from "@/lib/hooks/useAuthSession";
import { useUserNotes } from "@/lib/stores/userNotes";
import { useReviewCards } from "@/lib/stores/reviewCards";
import { useDocuments } from "@/lib/stores/documents";
import { useArtifacts } from "@/lib/stores/artifacts";
import { useImports } from "@/lib/stores/imports";
import { hasCloudRow } from "@/lib/sync/status";
import { buildAssetItems, type AssetItem } from "@/lib/agent/assetCatalog";

/**
 * 「我的资产」的数据：把五类来源摊平成一张清单。
 * 任一来源还没水合就返回 null（页面显示骨架）——绝不用半份数据渲染出「东西丢了」的错觉。
 *
 * 同步角标读的是最近一次云端拉取的快照（lib/sync/status），没对过账就不显示。
 */
export function useAgentAssets(): AssetItem[] | null {
  const {userId}=useAuthSession();
  const [classrooms,setClassrooms]=useState<{owner:string|null;rows:Array<{id:string;title:string;updatedAt:string;origin:"local"|"cloud"|"both"}>}>({owner:null,rows:[]});
  useEffect(()=>{
    if(!userId)return;
    let active=true;
    let cached:Array<{id:string;title:string;updatedAt:string;origin:"local"|"cloud"|"both"}>=[];
    try{const value=JSON.parse(localStorage.getItem(`ss-class:v1:${userId}`)||'{}');cached=Object.values(value.sessions||{}).map(row=>({...((row as {session:{id:string;title:string;updatedAt:string}}).session),origin:"local" as const}));}catch{}
    void fetch('/api/class/state',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({op:'session.list',expectedUserId:userId,input:{}})}).then(async response=>{
      if(!response.ok)throw new Error('Class metadata unavailable');
      const rows=await response.json() as Array<{id:string;title:string;updatedAt:string}>;
      const merged=new Map(cached.map(row=>[row.id,row]));
      for(const row of rows)merged.set(row.id,{...row,origin:merged.has(row.id)?"both":"cloud"});
      if(active)setClassrooms({owner:userId,rows:[...merged.values()]});
    }).catch(()=>{if(active)setClassrooms({owner:userId,rows:cached});});
    return()=>{active=false;};
  },[userId]);
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
    if (userId&&classrooms.owner!==userId)return null;
    if (!notesReady || !cardsReady || !docsReady || !artifactsReady || !importsReady) return null;
    return buildAssetItems({
      notes: noteOrder.map((id) => notesById[id]).filter(Boolean),
      cards: cardOrder.map((id) => cardsById[id]).filter(Boolean),
      documents: Object.values(docsById),
      artifacts: artifactOrder.map((id) => artifactsById[id]).filter(Boolean),
      imports: importOrder.map((id) => importsById[id]).filter(Boolean),
      cloudRow: hasCloudRow,
      classrooms:classrooms.owner===userId?classrooms.rows:[],
    });
  }, [
    classrooms,userId,
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