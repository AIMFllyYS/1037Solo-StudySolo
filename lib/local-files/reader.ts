import { Inflate, strFromU8 } from 'fflate';
export const MAX_LOCAL_SOURCE_BYTES = 512 * 1024 * 1024;
export const LOCAL_READ_CHARS = 12000;
export interface RangeSource {
    size: number;
    name: string;
    read: (start: number, end: number) => Promise<Uint8Array>;
}
export interface LocalPage {
    page: number;
    text: string;
    notes?: string;
}
interface ZipEntry {
    name: string;
    offset: number;
    compressed: number;
    size: number;
    method: number;
}
export function assertLocalSize(size: number) {
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_LOCAL_SOURCE_BYTES)
        throw new Error('仅本地文件须大于0字节且不超过512MiB。');
}
export class LocalSourceReader {
    private entries: Map<string, ZipEntry> | null = null;
    private pages: string[] = [];
    private cache = new Map<number, LocalPage>();
    constructor(readonly source: RangeSource) { assertLocalSize(source.size); }
    async catalog() {
        const ext = this.source.name.split('.').at(-1)?.toLowerCase();
        if (ext === 'ppt')
            throw new Error('旧PPT格式请先转为PPTX，或使用本机软件打开。');
        if (ext === 'pptx' || ext === 'docx') {
            await this.zipDirectory();
            if (ext === 'docx')
                this.pages = ['word/document.xml'];
            else {
                const presentation = await this.xml('ppt/presentation.xml'), rels = await this.xml('ppt/_rels/presentation.xml.rels');
                const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?\s*>/g)].map(m => [m[1], this.relative('ppt/presentation.xml', m[2])]));
                this.pages = [...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map(m => targets.get(m[1])).filter((v): v is string => !!v);
                if (!this.pages.length)
                    this.pages = [...this.entries!.keys()].filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/slide(\d+)/)![1]) - Number(b.match(/slide(\d+)/)![1]));
            }
            return { pages: this.pages.length, complete: true, format: ext };
        }
        // Text windows use byte offsets, never hold the whole file in memory.
        return { pages: Math.ceil(this.source.size / (32 * 1024)), complete: true, format: ext ?? 'text' };
    }
    async readPage(page: number): Promise<LocalPage> {
        if (!Number.isInteger(page) || page < 1)
            throw new Error('页码无效。');
        const hit = this.cache.get(page);
        if (hit)
            return hit;
        const catalog = await this.catalog();
        if (page > catalog.pages)
            throw new Error('页码超过文件范围。');
        let value: LocalPage;
        if (catalog.format === 'pptx' || catalog.format === 'docx') {
            const path = this.pages[page - 1], xml = await this.xml(path);
            let notes = '';
            if (catalog.format === 'pptx') {
                const rel = path.replace(/\/([^/]+)$/, '/_rels/$1.rels'), relationships = await this.xml(rel, true);
                const noteTarget = [...relationships.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(s => /\/notesSlide"/.test(s))?.match(/\bTarget="([^"]+)"/)?.[1];
                if (noteTarget)
                    notes = xmlText(await this.xml(this.relative(path, noteTarget)));
            }
            value = { page, text: xmlText(xml), ...(notes ? { notes } : {}) };
        }
        else {
            const start = (page - 1) * 32768;
            const bytes = await this.source.read(Math.max(0, start - 3), Math.min(this.source.size, start + 32768 + 3));
            let offset = start ? 3 : 0;
            while (offset < bytes.length && (bytes[offset] & 0xc0) === 0x80)
                offset++;
            let end = Math.min(bytes.length, (start ? 3 : 0) + 32768);
            while (end < bytes.length && (bytes[end] & 0xc0) === 0x80)
                end++;
            value = { page, text: new TextDecoder().decode(bytes.subarray(offset, end)) };
        }
        this.cache.set(page, value);
        const cachedBytes = () => [...this.cache.values()].reduce((bytes, item) => bytes + (item.text.length + (item.notes?.length ?? 0)) * 2, 0);
        while (this.cache.size > 8 || cachedBytes() > 2 * 1024 * 1024)
            this.cache.delete(this.cache.keys().next().value!);
        return value;
    }
    private relative(base: string, target: string) {
        const parts = base.split('/').slice(0, -1);
        for (const part of target.split('/')) {
            if (part === '..')
                parts.pop();
            else if (part && part !== '.')
                parts.push(part);
        }
        const result = parts.join('/');
        if (!/^(ppt|word)\//.test(result))
            throw new Error('不支持的文档关联路径。');
        return result;
    }
    private async zipDirectory() {
        if (this.entries)
            return;
        const tailStart = Math.max(0, this.source.size - 65557), tail = await this.source.read(tailStart, this.source.size);
        const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
        let eocd = -1;
        for (let i = tail.length - 22; i >= 0; i--)
            if (view.getUint32(i, true) === 0x06054b50) {
                eocd = i;
                break;
            }
        if (eocd < 0)
            throw new Error('文件不是有效的PPTX/DOCX压缩容器。');
        const count = view.getUint16(eocd + 10, true), size = view.getUint32(eocd + 12, true), start = view.getUint32(eocd + 16, true);
        if (count === 65535 || start === 0xffffffff || size > 8 * 1024 * 1024 || start + size > this.source.size || count > 50000)
            throw new Error('文档目录超出解析安全范围（ZIP64暂不支持）。');
        const directory = await this.source.read(start, start + size), d = new DataView(directory.buffer, directory.byteOffset, directory.byteLength), entries = new Map<string, ZipEntry>();
        for (let offset = 0, index = 0; index < count; index++) {
            if (offset + 46 > directory.length || d.getUint32(offset, true) !== 0x02014b50)
                throw new Error('文档目录损坏。');
            const nameLength = d.getUint16(offset + 28, true), extra = d.getUint16(offset + 30, true), comment = d.getUint16(offset + 32, true);
            const name = new TextDecoder().decode(directory.subarray(offset + 46, offset + 46 + nameLength));
            if (/^(ppt|word)\//.test(name) && /\.xml(?:\.rels)?$|\.rels$/.test(name))
                entries.set(name, { name, method: d.getUint16(offset + 10, true), compressed: d.getUint32(offset + 20, true), size: d.getUint32(offset + 24, true), offset: d.getUint32(offset + 42, true) });
            offset += 46 + nameLength + extra + comment;
        }
        this.entries = entries;
    }
    private async xml(name: string, optional = false): Promise<string> {
        const entry = this.entries!.get(name);
        if (!entry) {
            if (optional)
                return '';
            throw new Error(`缺少文档内容：${name}`);
        }
        if (entry.size > 32 * 1024 * 1024 || entry.compressed > 32 * 1024 * 1024)
            throw new Error('本页解压内容超过32MiB安全上限，未使用不完整结果。');
        const header = await this.source.read(entry.offset, entry.offset + 30), d = new DataView(header.buffer, header.byteOffset, header.byteLength);
        if (d.getUint32(0, true) !== 0x04034b50 || (d.getUint16(6, true) & 1))
            throw new Error('文档加密或损坏，无法读取。');
        const start = entry.offset + 30 + d.getUint16(26, true) + d.getUint16(28, true);
        if (start + entry.compressed > this.source.size)
            throw new Error('文档正文不完整。');
        let total = 0;
        const output: Uint8Array[] = [];
        const collect = (bytes: Uint8Array) => {
            total += bytes.length;
            if (total > 32 * 1024 * 1024 || total > entry.size)
                throw new Error('本页实际解压内容超限。');
            output.push(bytes);
        };
        if (entry.method === 0)
            collect(await this.source.read(start, start + entry.compressed));
        else if (entry.method === 8) {
            const inflate = new Inflate((chunk) => collect(chunk));
            for (let offset = 0; offset < entry.compressed; offset += 65536)
                inflate.push(await this.source.read(start + offset, start + Math.min(entry.compressed, offset + 65536)), offset + 65536 >= entry.compressed);
        }
        else
            throw new Error('不支持的文档压缩方式。');
        if (total !== entry.size)
            throw new Error('本页正文校验失败。');
        const merged = new Uint8Array(total);
        let at = 0;
        for (const part of output) {
            merged.set(part, at);
            at += part.length;
        }
        return strFromU8(merged);
    }
}
function xmlText(xml: string) { return [...xml.matchAll(/<(?:a|w):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:a|w):t>/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")).join('\n'); }
