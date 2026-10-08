const fs = require('node:fs');
const path = require('node:path');
const uuid = /^[a-f0-9-]{36}$/i;
module.exports.installLocalFiles = ({ ipcMain, senderIsApp, userData }) => {
  const directory = path.join(userData, 'local-file-grants');
  const readGrants = owner => { if (!uuid.test(owner)) throw new Error('Invalid owner'); try { return JSON.parse(fs.readFileSync(path.join(directory, owner + '.json'), 'utf8')); } catch { return {}; } };
  const save = (owner, grants) => { fs.mkdirSync(directory, { recursive: true }); const target = path.join(directory, owner + '.json'); fs.writeFileSync(target + '.tmp', JSON.stringify(grants), { mode: 0o600 }); fs.renameSync(target + '.tmp', target); };
  const authorized = (event, owner, id) => { if (!senderIsApp(event) || !uuid.test(id)) throw new Error('Local source unavailable'); const grant = readGrants(owner)[id]; if (!grant) throw new Error('Local source needs reconnect'); return grant; };
  ipcMain.handle('local-files:register', async (event, input) => {
    if (!senderIsApp(event) || !uuid.test(input?.owner) || !uuid.test(input?.id) || typeof input?.path !== 'string') throw new Error('Local source unavailable');
    const canonical = await fs.promises.realpath(input.path), stat = await fs.promises.stat(canonical);
    if (!stat.isFile() || stat.size < 1 || stat.size > 512 * 1024 * 1024) throw new Error('Local file exceeds 512MiB');
    const grants = readGrants(input.owner); grants[input.id] = { path: canonical }; save(input.owner, grants); return { id: input.id };
  });
  ipcMain.handle('local-files:info', async (event, { owner, id }) => {
    const grant = authorized(event, owner, id), stat = await fs.promises.stat(grant.path);
    if (!stat.isFile()) throw new Error('Local source needs reconnect'); return { name: path.basename(grant.path), size: stat.size, lastModified: Math.trunc(stat.mtimeMs) };
  });
  ipcMain.handle('local-files:read', async (event, { owner, id, start, end,version }) => {
    const grant = authorized(event, owner, id);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end - start > 8 * 1024 * 1024) throw new Error('Invalid local range');
    const file = await fs.promises.open(grant.path, 'r');
    try { const stat = await file.stat(); if (!stat.isFile() || end > stat.size || stat.size > 512 * 1024 * 1024 || version!==`${stat.size}:${Math.trunc(stat.mtimeMs)}`) throw new Error('Local source changed'); const bytes = Buffer.alloc(end - start); const result = await file.read(bytes, 0, bytes.length, start); if (result.bytesRead !== bytes.length) throw new Error('Local source incomplete'); return new Uint8Array(bytes); }
    finally { await file.close(); }
  });
  ipcMain.handle('local-files:remove', (event, { owner, id }) => { authorized(event, owner, id); const grants = readGrants(owner); delete grants[id]; save(owner, grants); });
};
