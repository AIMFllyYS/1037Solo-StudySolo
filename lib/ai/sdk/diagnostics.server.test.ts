import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelDiagnosticFetch, recordModelFailure } from './diagnostics.server';
test('model diagnostic records stage and HTTP metadata without credentials or body', async () => {
    const previous = console.warn, logs: string[] = [];
    console.warn = (...args) => { logs.push(args.join(' ')); };
    try {
        const observed = modelDiagnosticFetch(async () => new Response('private raw response', { status: 503, headers: { 'content-type': 'text/html', 'authorization': 'secret-response' } }), 'fixture-channel');
        await observed('https://private.invalid/?token=secret', { headers: { authorization: 'Bearer secret' }, body: 'private raw request' });
        recordModelFailure('fixture-channel', 'stream', { name: 'AI_JSONParseError', message: 'private error', requestBodyValues: { private: true } });
        const text = logs.join(' ');
        assert.match(text, /RESPONSE_PARSE/);
        assert.match(text, /503/);
        assert.equal(text.includes('text/html'), true);
        assert.doesNotMatch(text, /secret|private|authorization|requestBodyValues/);
    }
    finally {
        console.warn = previous;
    }
});
