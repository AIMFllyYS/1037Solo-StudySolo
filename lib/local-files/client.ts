'use client';
import { createStore, get, set, del } from 'idb-keyval';
import { getStorageOwner, getOwnerEpoch, onStorageOwnerChange } from '@/lib/storage/ownerScope';
import { useImports, recordImport } from '@/lib/stores/imports';
import { useChatHistory } from '@/lib/stores/chatHistory';
import { assertLocalSize } from './reader';
interface DesktopFiles {
    register(file: File, owner: string, id: string): Promise<{
        id: string;
    }>;
    info(id: string, owner: string): Promise<{
        size: number;
        name: string;
        lastModified: number;
    }>;
    read(id: string, owner: string, start: number, end: number, version?: string): Promise<Uint8Array>;
    remove(id: string, owner: string): Promise<void>;
}
function desktop() {
    return (globalThis as {
        desktop?: {
            localFiles?: DesktopFiles;
        };
    }).desktop?.localFiles;
}
const handles = createStore('studysolo-local-sources', 'handles');
let worker: Worker | null = null, sequence = 0, chain: Promise<unknown> = Promise.resolve();
const waiting = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}>();
const connected = new Set<string>();
const selectedFiles = new Map<string, File>();
function stop() {
    worker?.terminate();
    worker = null;
    connected.clear();
    for (const pending of waiting.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('本地读取已停止，请重新打开文件。'));
    }
    waiting.clear();
    chain = Promise.resolve();
}
onStorageOwnerChange(() => { selectedFiles.clear(); stop(); });
function instance() {
    if (worker)
        return worker;
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = async (event) => {
        const message = event.data;
        if (message.operation === 'evicted') { connected.delete(message.sourceId); return; }
        if (message.operation === 'range') {
            const owner = getStorageOwner(), record = useImports.getState().byId[message.sourceId], active = worker;
            try {
                if (!owner || !record?.desktopFileId)
                    throw new Error('本地源文件需要重连。');
                const bytes = await desktop()!.read(record.desktopFileId, owner, message.start, message.end, record.sourceVersion);
                if (active === worker)
                    active!.postMessage({ operation: 'range-result', id: message.id, bytes });
            }
            catch (error) {
                active?.postMessage({ operation: 'range-result', id: message.id, error: error instanceof Error ? error.message : '读取失败' });
            }
            return;
        }
        if (message.progress)
            return;
        const pending = waiting.get(message.id);
        if (!pending)
            return;
        waiting.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error)
            pending.reject(new Error(message.error));
        else
            pending.resolve(message.result);
    };
    worker.onerror = () => stop();
    return worker;
}
async function request(input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const epoch = getOwnerEpoch();
    const run = async () => {
        signal?.throwIfAborted();
        if (epoch !== getOwnerEpoch())
            throw new Error('账号已切换。');
        const id = ++sequence;
        const abort = () => stop();
        signal?.addEventListener('abort', abort, { once: true });
        try {
            return await new Promise((resolve, reject) => { const timer = setTimeout(() => { stop(); reject(new Error('本地解析超时，可重新读取较小范围。')); }, 60000); waiting.set(id, { resolve, reject, timer }); instance().postMessage({ ...input, id }); });
        }
        finally {
            signal?.removeEventListener('abort', abort);
        }
    };
    const result = chain.catch(() => { }).then(run);
    chain = result.catch(() => { });
    return result;
}
export async function registerLocalFile(file: File, sessionId?: string | null, targetId?: string, handle?: FileSystemFileHandle): Promise<string> {
    assertLocalSize(file.size);
    const owner = getStorageOwner(), epoch = getOwnerEpoch();
    if (!owner) {
        const id = targetId?.startsWith('guest-') ? targetId : `guest-${crypto.randomUUID()}`;
        selectedFiles.set(id, file);
        connected.delete(id);
        return id;
    }
    const id = targetId ?? crypto.randomUUID(), previous = useImports.getState().byId[id];
    let desktopFileId: string | undefined;
    if (desktop())
        desktopFileId = (await desktop()!.register(file, owner, id)).id;
    if (owner !== getStorageOwner() || epoch !== getOwnerEpoch())
        throw new Error('账号已切换。');
    const version = `${file.size}:${file.lastModified}`;
    recordImport({ id, localFileId: id, kind: 'file', name: file.name, sizeBytes: file.size, mimeType: file.type, source: 'window-taskbar', sessionId: sessionId ?? previous?.sessionId, sourceVersion: version, desktopFileId });
    if (handle)
        await set(`${owner}:${id}`, handle, handles).catch(() => { });
    if (owner !== getStorageOwner() || epoch !== getOwnerEpoch())
        throw new Error('账号已切换。');
    if (previous && previous.sourceVersion !== version) {
        stop();
    }
    selectedFiles.set(id, file);
    connected.delete(id);
    return id;
}
export async function reconnectLocalFile(id: string): Promise<void> {
    if (connected.has(id))
        return;
    if (id.startsWith('guest-') && !getStorageOwner()) {
        const file = selectedFiles.get(id);
        if (!file)
            throw new Error('临时文件已关闭，请重新选择。');
        const epoch = getOwnerEpoch();
        await request({ operation: 'register', sourceId: id, name: file.name, size: file.size, file });
        if (epoch !== getOwnerEpoch())
            throw new Error('账号已变化，请重新打开文件。');
        connected.add(id);
        return;
    }
    const owner = getStorageOwner(), epoch = getOwnerEpoch(), record = useImports.getState().byId[id];
    if (!owner || !record)
        throw new Error('本地源文件需要重连。');
    const assertCurrent = () => {
        if (owner !== getStorageOwner() || epoch !== getOwnerEpoch())
            throw new Error('账号已切换，本地文件读取已停止。');
    };
    const selected = selectedFiles.get(id);
    if (selected) {
        await request({ operation: 'register', sourceId: id, name: selected.name, size: selected.size, file: selected });
        assertCurrent();
        connected.add(id);
        return;
    }
    const handle = await get<FileSystemFileHandle>(`${owner}:${id}`, handles).catch(() => null);
    assertCurrent();
    if (handle) {
        const permission = await (handle as FileSystemFileHandle & {
            queryPermission: () => Promise<string>;
        }).queryPermission?.();
        assertCurrent();
        if (permission === 'granted') {
            const file = await handle.getFile();
            assertCurrent();
            await registerLocalFile(file, record.sessionId, id, handle);
            assertCurrent();
            await request({ operation: 'register', sourceId: id, name: file.name, size: file.size, file });
            assertCurrent();
            connected.add(id);
            return;
        }
    }
    if (record.desktopFileId && desktop()) {
        const info = await desktop()!.info(record.desktopFileId, owner);
        assertLocalSize(info.size);
        if (epoch !== getOwnerEpoch())
            throw new Error('账号已切换。');
        const version = `${info.size}:${info.lastModified}`;
        if (record.sourceVersion !== version) {
            stop();
            recordImport({ ...record, id, sourceVersion: version, sizeBytes: info.size });
        }
        await request({ operation: 'register', sourceId: id, name: info.name, size: info.size });
        assertCurrent();
        connected.add(id);
        return;
    }
    throw new Error('本地源文件需要重连：请重新选择原文件，原对话和已读取片段仍保留。');
}
export async function readLocalSource(id: string, input: {
    operation: 'catalog' | 'read' | 'search';
    page?: number;
    offset?: number;
    query?: string;
}, signal?: AbortSignal) {
    const owner = getStorageOwner(), epoch = getOwnerEpoch(), record = useImports.getState().byId[id];
    if (record?.localFileId && !record.desktopFileId && owner) {
        const handle = await get<FileSystemFileHandle>(`${owner}:${id}`, handles).catch(() => null);
        if (owner !== getStorageOwner() || epoch !== getOwnerEpoch()) throw new Error('账号已切换。');
        if (handle) {
            const permission = await (handle as FileSystemFileHandle & { queryPermission?: () => Promise<string> }).queryPermission?.();
            if (owner !== getStorageOwner() || epoch !== getOwnerEpoch()) throw new Error('账号已切换。');
            if (permission !== 'granted') { selectedFiles.delete(id); stop(); throw new Error('本地文件授权已失效，请重新选择原文件。'); }
            const file = await handle.getFile();
            if (owner !== getStorageOwner() || epoch !== getOwnerEpoch()) throw new Error('账号已切换。');
            if (`${file.size}:${file.lastModified}` !== record.sourceVersion) await registerLocalFile(file, record.sessionId, id, handle);
        }
    }
    if (record?.desktopFileId && desktop() && owner) {
        const info = await desktop()!.info(record.desktopFileId, owner);
        if (owner !== getStorageOwner() || epoch !== getOwnerEpoch())
            throw new Error('账号已切换。');
        if (`${info.size}:${info.lastModified}` !== record.sourceVersion) {
            selectedFiles.delete(id);
            stop();
        }
    }
    await reconnectLocalFile(id);
    if (owner !== getStorageOwner() || epoch !== getOwnerEpoch())
        throw new Error('账号已切换。');
    if ((record?.mimeType ?? selectedFiles.get(id)?.type)?.startsWith('image/')) {
        if (input.operation === 'catalog')
            return { pages: 1, format: 'image', complete: true };
        if (input.operation === 'search')
            return { text: '照片没有文字索引，当前不执行OCR；请使用read查看缩略图。' };
        const file = selectedFiles.get(id);
        if (!file)
            throw new Error('图片AI读取需要重新选择原图片；原文件仅在本机。');
        signal?.throwIfAborted();
        const bitmap = await createImageBitmap(file);
        try {
            if (bitmap.width * bitmap.height > 40000000)
                throw new Error('图片像素过大，请在本机缩小后供AI读取；原文件保留。');
            const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            if (dataUrl.length > 1024 * 1024)
                throw new Error('缩略图超过AI读取预算，请缩小后重试。');
            if (owner !== getStorageOwner() || epoch !== getOwnerEpoch())
                throw new Error('账号已切换。');
            return { text: '本地照片缩略图（原文件未上传）。', image: { dataUrl, mimeType: 'image/jpeg' as const } };
        }
        finally {
            bitmap.close();
        }
    }
    return request({ ...input, sourceId: id }, signal);
}
export function localSourceIsLinked(id: string, sessionId: string): boolean {
    const record = useImports.getState().byId[id];
    const project = useChatHistory.getState().sessionsMeta.find(meta => meta.id === sessionId)?.folderId;
    return !!record?.localFileId && (record.sessionId === sessionId || !!project && record.projectId === project);
}
export function localSourceNeedsReconnect(id: string): boolean { return !connected.has(id) && !selectedFiles.has(id); }
export function localSourceCatalog(sessionId: string) { return Object.values(useImports.getState().byId).filter(r => localSourceIsLinked(r.id, sessionId)).slice(0, 100).map(r => ({ sourceId: r.id, name: r.name, size: r.sizeBytes, version: r.sourceVersion ?? '', location: 'local' as const, readable: !localSourceNeedsReconnect(r.id), needsReconnect: localSourceNeedsReconnect(r.id) })); }
export async function removeLocalSource(id: string) {
    const owner = getStorageOwner(), epoch = getOwnerEpoch(), record = useImports.getState().byId[id];
    if (!owner)
        return;
    await del(`${owner}:${id}`, handles).catch(() => { });
    if (owner !== getStorageOwner() || epoch !== getOwnerEpoch())
        return;
    if (record?.desktopFileId)
        await desktop()?.remove(record.desktopFileId, owner);
    if (owner !== getStorageOwner() || epoch !== getOwnerEpoch())
        return;
    selectedFiles.delete(id);
    stop();
    useImports.getState().remove(id);
}
