import { listCloudFiles, readCloudFileContext } from '@/lib/files/client';
import { useProjectFiles } from '@/lib/stores/assets/projectFiles';
import { sliceText } from './slice';
import { getOwnerEpoch, getStorageOwner } from '@/lib/storage/ownerScope';

/** Reconstruct this project's local index from its authoritative cloud files after refresh/device changes. */
export async function restoreProjectCloudFiles(projectId: string): Promise<void> {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  if (!owner) return;
  const files = await listCloudFiles(projectId);
  const restoredNames = new Set<string>();
  for (const file of files) {
    if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
    const existing = Object.values(useProjectFiles.getState().byId).find(entry => entry.cloudFileId === file.id);
    if (file.state === 'deleted' && !restoredNames.has(file.name)) {
      restoredNames.add(file.name);
      for (const entry of Object.values(useProjectFiles.getState().byId)) if (entry.projectId === projectId && entry.name === file.name && entry.cloudFileId && files.some(row => row.id === entry.cloudFileId)) useProjectFiles.getState().removeFile(entry.id);
      continue;
    }
    // Newest ready version wins for the project's name-based index; older immutable assets remain in the library.
    if (file.state !== 'ready' || restoredNames.has(file.name)) continue;
    restoredNames.add(file.name);
    if (existing?.status === 'indexed') continue;
    const processed = await readCloudFileContext(file.id);
    if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
    const id = useProjectFiles.getState().beginImport({ projectId, name: file.name, mimeType: file.mime_type, sizeBytes: Number(file.size_bytes) });
    useProjectFiles.getState().finishImport(id, sliceText(processed.text ?? '图片保存在云端，可由支持图片的 AI 按需读取。', { name: file.name }));
    useProjectFiles.setState(state => ({ byId: { ...state.byId, [id]: { ...state.byId[id]!, cloudFileId: file.id } } }));
  }
}
