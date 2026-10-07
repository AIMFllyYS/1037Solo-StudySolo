import { expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/lib/types/chat';
import { fileReference } from './contract';
const storage = vi.hoisted(() => ({ catalog: vi.fn(), load: vi.fn() }));
vi.mock('./service.server', () => ({ ownedFileCatalog: storage.catalog, loadProcessedFile: storage.load }));
import { resolveCloudFileParts } from './model.server';
it('all nine current photos reach the model, while older photos stay available through stable cloud references', async () => {
  const ids = Array.from({ length: 18 }, (_, i) => `10000000-0000-4000-8000-${String(i + 1).padStart(12,'0')}`);
  storage.catalog.mockResolvedValue(ids.map((id, i) => ({ id, name: `public-${i}.png`, state: 'ready' })));
  storage.load.mockResolvedValue({ v: 1, image: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,QUJD' } });
  const messages: ChatMessage[] = [0,1].map(turn => ({ id: `u${turn}`, role: 'user', timestamp: turn, parts: ids.slice(turn * 9, turn * 9 + 9).map(id => ({ type: 'file', mediaType: 'image/png', url: fileReference(id) })) }));
  const result = await resolveCloudFileParts(messages, '20000000-0000-4000-8000-000000000001');
  expect(result.catalog).toHaveLength(18);
  expect(storage.load).toHaveBeenCalledTimes(9);
  expect(result.messages[1].parts.filter(part => part.type === 'file')).toHaveLength(9);
  expect(JSON.stringify(result.messages[0])).toContain('直接调用 readProjectSlices');
});
