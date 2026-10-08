'use client';
import { useEffect } from 'react';
import { create } from 'zustand';
import { assetApi } from './client';
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange } from '@/lib/storage/ownerScope';
export interface CloudAssetIndex {
    id: string;
    source_type: string;
    source_id: string;
    title: string;
    media_type: string;
    source_path: string;
    metadata: Record<string, unknown>;
    archived_at: string | null;
    updated_at: string;
}
interface IndexState {
    assets: CloudAssetIndex[];
    trash: CloudAssetIndex[];
    error: string | null;
    loading: boolean;
    refresh: () => Promise<void>;
}
let flight: Promise<void> | null = null;
export const useAssetIndex = create<IndexState>((set) => ({ assets: [], trash: [], error: null, loading: false, refresh() {
        if (flight)
            return flight;
        const owner = getStorageOwner(), epoch = getOwnerEpoch();
        if (!owner)
            return Promise.resolve();
        set({ loading: true, error: null });
        const list = async (trash: boolean) => {
            const rows: CloudAssetIndex[] = [], seen = new Set<string>();
            let cursor: string | null = null;
            do {
                const result = await assetApi(`?${new URLSearchParams({ ...trash ? { trash: '1' } : {}, ...cursor ? { cursor } : {} })}`);
                if (!Array.isArray(result.assets))
                    throw new Error('资产目录格式无效。');
                rows.push(...result.assets);
                cursor = result.nextCursor;
                if (cursor && seen.has(cursor))
                    throw new Error('资产分页不完整。');
                if (cursor)
                    seen.add(cursor);
            } while (cursor);
            return rows;
        };
        const promise = Promise.all([list(false), list(true)]).then(([assets, trash]) => {
            if (owner === getStorageOwner() && epoch === getOwnerEpoch())
                set({ assets, trash, loading: false });
        }).catch(error => {
            if (owner === getStorageOwner() && epoch === getOwnerEpoch())
                set({ loading: false, error: error instanceof Error ? error.message : '资产目录读取失败。' });
        }).finally(() => {
            if (flight === promise)
                flight = null;
        });
        flight = promise;
        return promise;
    } }));
onStorageOwnerChange(() => { flight = null; useAssetIndex.setState({ assets: [], trash: [], error: null, loading: false }); });
export function useCloudAssetIndex() { const state = useAssetIndex(), refresh = state.refresh; useEffect(() => { void refresh(); }, [refresh]); return state; }
