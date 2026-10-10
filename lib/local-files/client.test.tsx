import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { activateStorageOwner } from '@/lib/storage/ownerScope';
import { useImports } from '@/lib/stores/assets/imports';
import { readLocalSource } from './client';
const { handle } = vi.hoisted(() => ({ handle: { queryPermission: vi.fn(), getFile: vi.fn() } }));
vi.mock('idb-keyval', () => ({ createStore: vi.fn(), get: vi.fn(async () => handle), set: vi.fn(async () => { }), del: vi.fn(async () => { }) }));
const messages: string[] = [];
class ReaderWorker {
    onmessage?: (event: {
        data: unknown;
    }) => void;
    terminate() { }
    registered = false;
    postMessage(message: {
        id: number;
        operation: string;
    }) {
        messages.push(message.operation);
        if (message.operation === 'register')
            this.registered = true;
        queueMicrotask(() => this.onmessage?.({ data: this.registered
                ? { id: message.id, result: message.operation === 'catalog' ? { pages: 1 } : {} }
                : { id: message.id, error: 'reader missing' } }));
    }
}
beforeEach(() => {
    activateStorageOwner('handle-owner');
    useImports.setState({ byId: { source: { id: 'source', localFileId: 'source', kind: 'file', name: 'notes.txt', source: 'window-taskbar', createdAt: 1, updatedAt: 1 } }, order: ['source'], _hasHydrated: true });
    messages.length = 0;
    handle.queryPermission.mockResolvedValue('granted');
    handle.getFile.mockResolvedValue(new File(['text'], 'notes.txt', { lastModified: 1 }));
    vi.stubGlobal('Worker', ReaderWorker);
});
afterEach(() => { activateStorageOwner(null); vi.unstubAllGlobals(); });
it('persistent handle recovery registers a reader before the first catalog request', async () => {
    expect(await readLocalSource('source', { operation: 'catalog' })).toEqual({ pages: 1 });
    expect(messages).toEqual(['register', 'catalog']);
});
it('a changed owner during handle permission lookup never registers or reads the file', async () => {
    handle.queryPermission.mockImplementationOnce(async () => { activateStorageOwner('other-owner'); return 'granted'; });
    await expect(readLocalSource('source', { operation: 'catalog' })).rejects.toThrow(/账号已切换/);
    expect(messages).toEqual([]);
});
