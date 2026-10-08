import { LocalSourceReader, type RangeSource } from './reader';
const readers = new Map<string, LocalSourceReader>();
const pdfs = new Map<string, import('pdfjs-dist').PDFDocumentProxy>();
const sources = new Map<string, RangeSource>();
const ranges = new Map<number, {
    resolve: (bytes: Uint8Array) => void;
    reject: (error: Error) => void;
}>();
let sequence = 0;
self.onmessage = async (event: MessageEvent) => {
    const input = event.data;
    if (input.operation === 'range-result') {
        const pending = ranges.get(input.id);
        ranges.delete(input.id);
        if (input.error)
            pending?.reject(new Error(input.error));
        else
            pending?.resolve(input.bytes);
        return;
    }
    try {
        if (input.operation === 'register') {
            await pdfs.get(input.sourceId)?.destroy();
            pdfs.delete(input.sourceId);
            sources.delete(input.sourceId);
            readers.delete(input.sourceId);
            const file = input.file as File | undefined;
            const source: RangeSource = { size: input.size, name: input.name, read: file ? async (start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer()) : (start, end) => new Promise((resolve, reject) => { const id = ++sequence; ranges.set(id, { resolve, reject }); self.postMessage({ operation: 'range', id, sourceId: input.sourceId, start, end }); }) };
            sources.set(input.sourceId, source);
            readers.set(input.sourceId, new LocalSourceReader(source));
            while (readers.size > 4) {
                const evicted = readers.keys().next().value!;
                await pdfs.get(evicted)?.destroy();
                pdfs.delete(evicted); sources.delete(evicted); readers.delete(evicted);
                self.postMessage({ operation: 'evicted', sourceId: evicted });
            }
            self.postMessage({ id: input.id, result: { registered: true } });
            return;
        }
        const reader = readers.get(input.sourceId);
        if (!reader)
            throw new Error('本地源文件需要重连。');
        let result: unknown;
        if (reader.source.name.toLowerCase().endsWith('.pdf')) {
            let pdf = pdfs.get(input.sourceId);
            if (!pdf) {
                const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
                pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
                const source = sources.get(input.sourceId)!;
                const range = new pdfjs.PDFDataRangeTransport(source.size, await source.read(0, Math.min(source.size, 65536)), true);
                range.requestDataRange = (begin: number, end: number) => { void source.read(begin, end).then(bytes => range.onDataRange(begin, bytes)).catch(() => range.abort()); };
                pdf = await pdfjs.getDocument({ range, disableAutoFetch: true, disableStream: true, rangeChunkSize: 65536, isEvalSupported: false, disableFontFace: true }).promise;
                pdfs.set(input.sourceId, pdf);
            }
            if (input.operation === 'catalog')
                result = { pages: pdf.numPages, complete: true, format: 'pdf' };
            else {
                const page = input.page ?? 1;
                if (page < 1 || page > pdf.numPages)
                    throw new Error('页码超过PDF范围。');
                const proxy = await pdf.getPage(page), content = await proxy.getTextContent();
                const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
                proxy.cleanup();
                const offset = input.offset ?? 0;
                result = input.operation === 'search' ? { hits: text.toLowerCase().includes(String(input.query).toLowerCase()) ? [{ page, text: text.slice(0, 1000) }] : [], scanStart:page,scanEnd:page,complete: page === 1 && pdf.numPages === 1, nextPage: page < pdf.numPages ? page + 1 : null } : { page, text: text.slice(offset, offset + 12000), nextOffset: offset + 12000 < text.length ? offset + 12000 : null };
            }
        }
        else if (input.operation === 'catalog')
            result = await reader.catalog();
        else if (input.operation === 'read') {
            const page = await reader.readPage(input.page ?? 1);
            const text = [page.text, page.notes ? `备注：\n${page.notes}` : ''].filter(Boolean).join('\n\n');
            const offset = input.offset ?? 0;
            result = { page: page.page, text: text.slice(offset, offset + 12000), nextOffset: offset + 12000 < text.length ? offset + 12000 : null };
        }
        else if (input.operation === 'search') {
            const catalog = await reader.catalog(), hits = [];
            const start = input.page ?? 1, last = Math.min(catalog.pages, start + 19);
            let scanned = start - 1;
            for (let page = start; page <= last; page++) {
                const content = await reader.readPage(page), text = content.text + '\n' + (content.notes ?? ''), at = text.toLowerCase().indexOf(String(input.query).toLowerCase());
                if (at >= 0)
                    hits.push({ page, text: text.slice(Math.max(0, at - 150), at + 450) });
                scanned = page;
                self.postMessage({ id: input.id, progress: { page, total: catalog.pages } });
                if (hits.length >= 10)
                    break;
            }
            result = { hits, scanStart:start,scanEnd:scanned,complete: start === 1 && scanned === catalog.pages, nextPage: scanned < catalog.pages ? scanned + 1 : null };
        }
        else
            throw new Error('不支持的本地读取操作。');
        self.postMessage({ id: input.id, result });
    }
    catch (error) {
        self.postMessage({ id: input.id, error: error instanceof Error ? error.message : '本地读取失败' });
    }
};
