import { mergeChatSnapshots } from '@/lib/storage/threeWayChatMerge';
import type { ChatMessage } from '@/lib/types/chat';
/** No timestamps or content-length heuristics: merge only independent changes. */
export function mergeIndependent(base: unknown, local: unknown, remote: unknown, kind: string): unknown | null {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (same(local, remote))
        return local;
    if (same(base, local))
        return remote;
    if (same(base, remote))
        return local;
    if (!base || !local || !remote || typeof base !== 'object' || typeof local !== 'object' || typeof remote !== 'object')
        return null;
    const b = base as Record<string, unknown>, l = local as Record<string, unknown>, r = remote as Record<string, unknown>;
    if (kind === 'chat-session') {
        const messages = mergeChatSnapshots(b.messages as ChatMessage[], l.messages as ChatMessage[], r.messages as ChatMessage[]);
        if (!messages)
            return null;
        const meta = { ...(r.meta as object), ...(l.meta as object), messageCount: messages.length, contextCheckpoint: undefined };
        return { ...l, messages, meta };
    }
    if (kind === 'document' && Array.isArray(b.sections) && Array.isArray(l.sections) && Array.isArray(r.sections)) {
        if (b.sections.length !== l.sections.length || b.sections.length !== r.sections.length)
            return null;
        const sections = [];
        for (let i = 0; i < b.sections.length; i++) {
            if (!same(l.sections[i], b.sections[i]) && !same(r.sections[i], b.sections[i]) && !same(l.sections[i], r.sections[i]))
                return null;
            sections.push(same(l.sections[i], b.sections[i]) ? r.sections[i] : l.sections[i]);
        }
        const strip = (v: Record<string, unknown>) => ({ ...v, sections: undefined, updatedAt: undefined, bodyRef: undefined });
        if (!same(strip(l), strip(b)) && !same(strip(r), strip(b)) && !same(strip(l), strip(r)))
            return null;
        return { ...(same(strip(l), strip(b)) ? r : l), sections, updatedAt: Date.now() };
    }
    if (kind === 'user-note' && typeof b.markdown === 'string' && typeof l.markdown === 'string' && typeof r.markdown === 'string') {
        const bs = b.markdown.split('\n\n'), ls = l.markdown.split('\n\n'), rs = r.markdown.split('\n\n');
        if (bs.length !== ls.length || bs.length !== rs.length)
            return null;
        for (let i = 0; i < bs.length; i++)
            if (bs[i] !== ls[i] && bs[i] !== rs[i] && ls[i] !== rs[i])
                return null;
        if (l.title !== b.title && r.title !== b.title && l.title !== r.title)
            return null;
        return { ...r, ...l, title: l.title === b.title ? r.title : l.title, markdown: bs.map((part, i) => part === ls[i] ? rs[i] : ls[i]).join('\n\n'), updatedAt: Date.now() };
    }
    return null;
}
