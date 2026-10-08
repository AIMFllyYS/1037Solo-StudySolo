import { test } from 'node:test';
import assert from 'node:assert/strict';
import { externalizePayload, BODY_CHUNK_BYTES, putBodyField } from './body';
test('large unicode bodies remain complete across bounded byte chunks and preserve sections', async () => {
    const text = '中文🙂'.repeat(800000), source = { id: 'd', status: 'done', sections: [{ title: 'first', markdown: text }, { title: 'second', markdown: 'tail' }] };
    const { payload, chunks } = await externalizePayload('document', source);
    const copy = structuredClone(payload), manifest = payload.bodyStorage as {
        fields: {
            path: (string | number)[];
            chunks: string[];
            bytes: number;
        }[];
    };
    for (const field of manifest.fields) {
        const decoder = new TextDecoder(), parts = [];
        for (const sha of field.chunks) {
            const bytes = chunks.get(sha)!;
            assert.ok(bytes.length <= BODY_CHUNK_BYTES);
            parts.push(decoder.decode(bytes, { stream: true }));
        }
        parts.push(decoder.decode());
        putBodyField(copy, field.path, parts.join(''));
    }
    assert.deepEqual(copy.sections, source.sections);
    assert.equal(source.sections[0].markdown, text);
});
