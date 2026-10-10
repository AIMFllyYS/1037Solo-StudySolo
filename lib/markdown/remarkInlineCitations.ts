import { visit } from "unist-util-visit";
import { INLINE_CITE_RE, parseCiteIndexes } from "@/lib/chat/sources/citationCatalog";

/**
 * 把正文里的 [1] / [1][2] / [1,2] 收成 cite-ref 节点。
 * 只挂在聊天 MessageContent 上，不要进笔记共享管线——教材正文里的 [1] 不是引用标记。
 *
 * 链接、图片、代码、行内公式不会被改：它们在 mdast 里不是这段 text，或父节点被跳过。
 * remark-gfm 有时会把未定义的 [1] 收成 linkReference，这里一并转成 cite-ref。
 */

interface MdastNode {
  type: string;
  value?: string;
  identifier?: string;
  children?: MdastNode[];
  data?: Record<string, unknown>;
}

const SKIP_PARENTS = new Set([
  "link",
  "linkReference",
  "image",
  "imageReference",
  "definition",
  "inlineCode",
  "code",
]);

function citeRefIndexes(node: MdastNode): number[] {
  return parseCiteIndexes(String((node.data?.hProperties as { indexes?: string } | undefined)?.indexes ?? ""));
}

function citeRefNode(indexes: number[]): MdastNode {
  return {
    type: "citeRef",
    data: {
      hName: "cite-ref",
      hProperties: { indexes: indexes.join(",") },
    },
  };
}

function mergeCiteIndexes(left: number[], right: number[]): number[] {
  const out = [...left];
  for (const index of right) {
    if (!out.includes(index)) out.push(index);
  }
  return out;
}

/** 相邻的 [1][2] / [1,2][3] 收成一张悬浮卡，不要拆成两枚各弹各的。 */
function mergeAdjacentCiteRefs(node: MdastNode): void {
  if (!node.children?.length) return;
  const children: MdastNode[] = [];
  for (const child of node.children) {
    mergeAdjacentCiteRefs(child);
    const prev = children[children.length - 1];
    if (prev?.type === "citeRef" && child.type === "citeRef") {
      children[children.length - 1] = citeRefNode(mergeCiteIndexes(citeRefIndexes(prev), citeRefIndexes(child)));
    } else {
      children.push(child);
    }
  }
  node.children = children;
}

function splitTextCitations(value: string): MdastNode[] | null {
  INLINE_CITE_RE.lastIndex = 0;
  if (!INLINE_CITE_RE.test(value)) return null;
  INLINE_CITE_RE.lastIndex = 0;

  const nodes: MdastNode[] = [];
  let last = 0;
  let matched = false;
  let match: RegExpExecArray | null;
  while ((match = INLINE_CITE_RE.exec(value)) !== null) {
    const indexes = parseCiteIndexes(match[1] ?? "");
    if (!indexes.length) continue;
    const prev = nodes[nodes.length - 1];
    if (matched && match.index === last && prev?.type === "citeRef") {
      nodes[nodes.length - 1] = citeRefNode(mergeCiteIndexes(citeRefIndexes(prev), indexes));
      last = match.index + match[0].length;
      continue;
    }
    matched = true;
    if (match.index > last) nodes.push({ type: "text", value: value.slice(last, match.index) });
    nodes.push(citeRefNode(indexes));
    last = match.index + match[0].length;
  }
  if (!matched) return null;
  if (last < value.length) nodes.push({ type: "text", value: value.slice(last) });
  return nodes.length ? nodes : null;
}

function numericReferenceIndexes(node: MdastNode): number[] | null {
  const raw = node.identifier ?? "";
  const indexes = parseCiteIndexes(raw);
  if (!indexes.length || indexes.join(",") !== raw.trim()) return null;
  return indexes;
}

export default function remarkInlineCitations() {
  return (tree: unknown) => {
    visit(
      tree as never,
      (node: MdastNode, index: number | null, parent: MdastNode | null) => {
        if (parent == null || index == null) return;
        if (SKIP_PARENTS.has(parent.type)) return;

        if (node.type === "linkReference") {
          const indexes = numericReferenceIndexes(node);
          if (!indexes) return;
          parent.children![index] = citeRefNode(indexes);
          return index + 1;
        }

        if (node.type !== "text" || typeof node.value !== "string") return;
        const replacement = splitTextCitations(node.value);
        if (!replacement) return;
        parent.children!.splice(index, 1, ...replacement);
        return index + replacement.length;
      },
    );
    mergeAdjacentCiteRefs(tree as MdastNode);
  };
}
