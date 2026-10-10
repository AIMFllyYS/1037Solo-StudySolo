/**
 * Crepe（Milkdown）列表项的 Enter 修复。
 *
 * 背景：prosemirror-schema-list 的 splitListItem 只有在「光标所在空段落是
 * list_item 的最后一个子块」时才会把 Enter 让给 liftEmptyBlock 退出列表。
 * 一旦 list_item 内出现脏结构——光标块后面躺着多余的空段落 / hardbreak 节点，
 * 或光标停在 hardbreak 之前——Enter 永远走普通 split：新 item 把尾随脏块一起
 * 带走，形成永远退不出列表的自锁；此时 `# `/`1. ` 等 input rule 也因会破坏
 * list_item 的 `paragraph block*` 结构而全部失效（标题、有序列表都打不出来）。
 *
 * 脏结构的来源（都会让用户在 DevTools 里看到含 <br> 的多余标签）：
 * - 浏览器/IME 触发 insertLineBreak 时 ProseMirror 合成 Shift-Enter，
 *   InsertHardbreak 写入 hardbreak 节点（toDOM 就是 <br>）；
 * - 连续两次 Shift-Enter 会把 hardbreak 替换成 item 内的第二个空段落
 *   （渲染为 <p><br></p>）；
 * - 粘贴的 <br> 被 hardbreak 的 parseDOM 吞成节点；
 * - markdown 回环：remarkLineBreak 把文本里的 \n 解析成 inline hardbreak。
 *
 * 本模块只负责在 Enter 前清洗这些脏块，随后返回 false 把按键交还原生
 * keymap 链（splitListItem → liftEmptyBlock）在干净文档上走完——不重写
 * lift 逻辑，风险最小。
 *
 * 项目只直接依赖 @milkdown/crepe，拿不到 prosemirror 类型，这里按用到的
 * 字段声明最小结构类型。
 */

interface GuardNode {
  type: { name: string };
  isTextblock: boolean;
  nodeSize: number;
  childCount: number;
  child: (index: number) => GuardNode;
  firstChild: GuardNode | null;
  forEach: (cb: (node: GuardNode, offset: number, index: number) => void) => void;
}

interface GuardResolvedPos {
  depth: number;
  parentOffset: number;
  parent: GuardNode;
  node: (depth: number) => GuardNode;
  index: (depth: number) => number;
  start: (depth?: number) => number;
  end: (depth?: number) => number;
}

interface GuardSelection {
  empty: boolean;
  $from: GuardResolvedPos;
}

export interface GuardEditorState {
  selection: GuardSelection;
  tr: { delete: (from: number, to: number) => unknown };
}

export interface GuardEditorView {
  state: GuardEditorState;
  dispatch: (tr: unknown) => void;
}

export interface GuardKeyEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

function isHardbreak(node: GuardNode): boolean {
  return node.type.name === "hardbreak";
}

/** 「看着是空的、其实带垃圾」的块：空段落，或只装 hardbreak 的段落。 */
function isJunkBlock(node: GuardNode): boolean {
  if (!node.isTextblock || node.type.name !== "paragraph") return false;
  if (node.childCount === 0) return true;
  let junk = true;
  node.forEach((child) => {
    if (!isHardbreak(child)) junk = false;
  });
  return junk;
}

export interface DeleteRange {
  from: number;
  to: number;
}

/**
 * 计算 Enter 前需要删除的脏内容区间（按原文档坐标）。
 * 返回空数组 = 无需清洗，直接走原生行为。
 */
export function listEnterCleanupRanges(state: GuardEditorState): DeleteRange[] {
  const sel = state.selection;
  if (!sel.empty) return [];
  const $from = sel.$from;
  if ($from.depth < 2) return [];
  const item = $from.node(-1);
  if (item?.type?.name !== "list_item") return [];
  const para = $from.parent;
  if (!para?.isTextblock || para.type.name !== "paragraph") return [];

  const ranges: DeleteRange[] = [];
  const itemDepth = $from.depth - 1;
  const itemStart = $from.start(itemDepth);
  const paraIndex = $from.index(itemDepth);

  // 1) 光标块之后、item 内连续的垃圾尾随块（空段落 / 纯 hardbreak 段落）。
  //    这些块让「空段落=最后子块」的退出条件永不成立，且会随 split 传染给新 item。
  let pos = itemStart;
  for (let i = 0; i < item.childCount; i++) {
    const child = item.child(i);
    const from = pos;
    const to = pos + child.nodeSize;
    if (i > paraIndex) {
      if (!isJunkBlock(child)) break;
      ranges.push({ from, to });
    }
    pos = to;
  }

  const contentFrom = $from.start();
  const contentTo = $from.end();
  if (para.childCount > 0 && isJunkBlock(para)) {
    // 2) 光标块自身只装 hardbreak → 清成空段落，原生链按「空块」正常退出。
    ranges.push({ from: contentFrom, to: contentTo });
  } else if ($from.parentOffset === 0 && para.firstChild && isHardbreak(para.firstChild)) {
    // 3) 光标停在块首、前面躺着前导 hardbreak：split 会把光标再次放到
    //    hardbreak 前，同样自锁。剥掉前导 hardbreak 再走原生 split。
    let cut = 0;
    para.forEach((child, offset) => {
      if (offset === cut && isHardbreak(child)) cut += child.nodeSize;
    });
    if (cut > 0) ranges.push({ from: contentFrom, to: contentFrom + cut });
  }

  return ranges;
}

/**
 * 挂到 Crepe 的 editorViewOptions.handleKeyDown：先于所有 keymap 插件执行。
 * 清洗完返回 false，让原生 Enter 链在干净文档上继续。
 */
export function guardListEnterKeydown(view: GuardEditorView, event: GuardKeyEvent): boolean {
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  const ranges = listEnterCleanupRanges(view.state);
  if (ranges.length === 0) return false;
  const tr = view.state.tr;
  // 倒序删除，前面的区间坐标不受后删区间影响。
  for (const range of [...ranges].sort((a, b) => b.from - a.from)) {
    tr.delete(range.from, range.to);
  }
  view.dispatch(tr);
  return false;
}
