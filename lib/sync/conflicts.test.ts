import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeIndependent } from './conflicts';
test('different MD paragraphs merge while overlapping edits keep both candidates', () => {
    const base = { title: 'note', markdown: 'one\n\ntwo', updatedAt: 1 };
    const result = mergeIndependent(base, { ...base, markdown: 'local\n\ntwo', updatedAt: 2 }, { ...base, markdown: 'one\n\nremote', updatedAt: 3 }, 'user-note') as {
        markdown: string;
    };
    assert.equal(result.markdown, 'local\n\nremote');
    assert.equal(mergeIndependent(base, { ...base, markdown: 'A\n\ntwo' }, { ...base, markdown: 'B\n\ntwo' }, 'user-note'), null);
});
test('same-length HTML differences and uncertain bases never choose a winner by time', () => {
    assert.equal(mergeIndependent({ html: 'old' }, { html: 'aaa' }, { html: 'bbb' }, 'artifact'), null);
    assert.equal(mergeIndependent(null, { html: 'local' }, { html: 'remote' }, 'artifact'), null);
});
