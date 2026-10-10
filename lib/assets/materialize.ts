'use client';
import type { ChatMessage } from '@/lib/types/chat';
import { useArtifacts } from '@/lib/stores/assets/artifacts';
import { useDocuments } from '@/lib/stores/assets/documents';
/** Only completed, reusable outputs become assets; tool instructions/logs do not. */
export function materializeAnswerAssets(message: ChatMessage) {
    const text = message.parts.filter(p => p.type === 'text').map(p => p.type === 'text' ? p.text : '').join('\n');
    let index = 0;
    for (const match of text.matchAll(/<SvgDiagram\b[^>]*>([\s\S]*?)<\/SvgDiagram>/gi)) {
        const svg = match[1].match(/<svg\b[\s\S]*?<\/svg>/i)?.[0];
        if (!svg)
            continue;
        const id = `diagram-${message.id}-${index++}`;
        if (useArtifacts.getState().byId[id])
            continue;
        const title = match[0].match(/\btitle="([^"]+)"/)?.[1] ?? '图示';
        useArtifacts.getState().saveDone(id, title, `<!doctype html><html><head><meta charset="utf-8"></head><body>${svg}</body></html>`);
    }
    for (const part of message.parts) {
        if (part.type !== 'tool-createQuiz' || part.state !== 'output-available')
            continue;
        const questions = part.output.questions;
        if (!Array.isArray(questions) || !questions.length)
            continue;
        const id = `quiz-${part.toolCallId}`;
        if (useDocuments.getState().byId[id])
            continue;
        const title = String(part.output.title ?? '题集'), markdown = questions.map((q, index) => `## ${index + 1}. ${q.stem}\n\n${(q.options ?? []).map((option, i) => `${String.fromCharCode(65 + i)}. ${typeof option === 'string' ? option : JSON.stringify(option)}`).join('\n')}\n\n答案：${JSON.stringify(q.answer)}\n\n${q.explanation ?? ''}\n\n题目数据：\n\`\`\`json\n${JSON.stringify(q)}\n\`\`\``).join('\n\n');
        const store = useDocuments.getState();
        store.create(id, { title, format: 'markdown', genre: 'review-notes', brief: '已完成工具题集的不可变保存稿' });
        store.setSections(id, [{ title: '题集', markdown, status: 'done' }]);
        store.setStatus(id, 'done');
    }
}
