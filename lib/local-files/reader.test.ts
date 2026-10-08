import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { LocalSourceReader, assertLocalSize, MAX_LOCAL_SOURCE_BYTES } from './reader';
test('512MiB text source is read as bounded ranges, not a full arrayBuffer', async () => {
    const sizes: number[] = [];
    const reader = new LocalSourceReader({ name: 'large.txt', size: MAX_LOCAL_SOURCE_BYTES, read: async (start, end) => { sizes.push(end - start); return new Uint8Array(end - start).fill(65); } });
    assert.equal((await reader.readPage(1)).text.length, 32768);
    assert.ok(Math.max(...sizes) < 65536);
    assert.throws(() => assertLocalSize(MAX_LOCAL_SOURCE_BYTES + 1), /512/);
});
test('PPTX reads selected slide and linked notes while ignoring large media', async () => {
    const bytes = zipSync({ 'ppt/slides/slide1.xml': strToU8('<a:t>正文</a:t>'), 'ppt/slides/_rels/slide1.xml.rels': strToU8('<Relationship Type="x/notesSlide" Target="../notesSlides/notesSlide1.xml"/>'), 'ppt/notesSlides/notesSlide1.xml': strToU8('<a:t>备注</a:t>'), 'ppt/presentation.xml': strToU8(''), 'ppt/_rels/presentation.xml.rels': strToU8(''), 'ppt/media/video.mp4': new Uint8Array(1024 * 1024) });
    const reader = new LocalSourceReader({ name: 'deck.pptx', size: bytes.length, read: async (start, end) => bytes.slice(start, end) });
    const page = await reader.readPage(1);
    assert.equal(page.text, '正文');
    assert.equal(page.notes, '备注');
});
test('UTF-8 windows join without duplicated or broken boundary characters', async () => {
    const text = 'a'.repeat(32767) + '中文🙂' + 'z'.repeat(32768);
    const bytes = strToU8(text);
    const reader = new LocalSourceReader({ name: 'utf8.txt', size: bytes.length, read: async (start, end) => bytes.slice(start, end) });
    const catalog = await reader.catalog();
    let joined = '';
    for (let page = 1; page <= catalog.pages; page++)
        joined += (await reader.readPage(page)).text;
    assert.equal(joined, text);
});
