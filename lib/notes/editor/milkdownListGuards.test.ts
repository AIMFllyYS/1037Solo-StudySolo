import assert from "node:assert/strict";
import { test } from "node:test";
import {
  guardListEnterKeydown,
  listEnterCleanupRanges,
  type GuardEditorState,
  type GuardEditorView,
  type GuardKeyEvent,
} from "./milkdownListGuards.ts";

/**
 * 文档布局固定为 doc > bullet_list > list_item > [段落...]：
 * bullet_list 占 pos 0，list_item 占 pos 1，item 内容从 pos 2 起。
 * 这里用手写的最小结构模拟 ProseMirror 节点 / ResolvedPos，
 * 覆盖 milkdownListGuards 用到的全部字段。
 */
interface MockNode {
  type: { name: string };
  isTextblock: boolean;
  nodeSize: number;
  childCount: number;
  child: (i: number) => MockNode;
  firstChild: MockNode | null;
  forEach: (cb: (node: MockNode, offset: number, index: number) => void) => void;
}

function leaf(name: string, nodeSize: number): MockNode {
  return {
    type: { name },
    isTextblock: false,
    nodeSize,
    childCount: 0,
    child: () => { throw new Error("leaf"); },
    firstChild: null,
    forEach: () => {},
  };
}

function block(name: string, children: MockNode[]): MockNode {
  const content = children.reduce((n, c) => n + c.nodeSize, 0);
  return {
    type: { name },
    isTextblock: name === "paragraph",
    nodeSize: content + 2,
    childCount: children.length,
    child: (i) => children[i],
    firstChild: children[0] ?? null,
    forEach: (cb) => {
      let offset = 0;
      children.forEach((c, i) => {
        cb(c, offset, i);
        offset += c.nodeSize;
      });
    },
  };
}

const hb = () => leaf("hardbreak", 1);
const text = (s: string) => leaf("text", s.length);
const para = (...children: MockNode[]) => block("paragraph", children);
const nestedList = () => block("bullet_list", [block("list_item", [para(text("x"))])]);

/** 光标落在 item 第 paraIndex 个段落内、parentOffset 处。 */
function stateInItem(
  children: MockNode[],
  paraIndex: number,
  parentOffset = 0,
  empty = true,
): GuardEditorState {
  const listItem = block("list_item", children);
  const doc = block("doc", [block("bullet_list", [listItem])]);
  let paraPos = 2;
  for (let i = 0; i < paraIndex; i++) paraPos += children[i].nodeSize;
  const para = children[paraIndex];
  return {
    selection: {
      empty,
      $from: {
        depth: 3,
        parent: para,
        parentOffset,
        node: (d: number) => (d === -1 || d === 2 ? listItem : doc),
        index: (d: number) => (d === 2 ? paraIndex : 0),
        start: (d?: number) => (d === undefined || d === 3 ? paraPos + 1 : d === 2 ? 2 : 0),
        end: () => paraPos + para.nodeSize - 1,
      },
    },
    tr: { delete: () => ({}) },
  };
}

const enter: GuardKeyEvent = { key: "Enter", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false };

function makeView(state: GuardEditorState) {
  const deletes: Array<[number, number]> = [];
  const tr = {
    delete: (from: number, to: number) => {
      deletes.push([from, to]);
      return tr;
    },
  };
  let dispatched = 0;
  const view: GuardEditorView = { state: { ...state, tr }, dispatch: () => { dispatched += 1; } };
  return { view, deletes, dispatched: () => dispatched };
}

test("不在 list_item 里 → 不清洗", () => {
  const state = {
    selection: {
      empty: true,
      $from: {
        depth: 1,
        parent: para(text("x")),
        parentOffset: 0,
        node: () => block("doc", []),
        index: () => 0,
        start: () => 1,
        end: () => 1,
      },
    },
    tr: { delete: () => ({}) },
  };
  assert.deepEqual(listEnterCleanupRanges(state), []);
});

test("选区非空 → 不清洗", () => {
  const state = stateInItem([para(hb())], 0, 0, false);
  assert.deepEqual(listEnterCleanupRanges(state), []);
});

test("干净的列表项 → 不清洗", () => {
  const state = stateInItem([para(text("甲"))], 0);
  assert.deepEqual(listEnterCleanupRanges(state), []);
});

test("光标段之后躺着空段落 → 删掉尾随空段", () => {
  // para("甲") 占 [2,5)，空 para 占 [5,7)
  const state = stateInItem([para(text("甲")), para()], 0);
  assert.deepEqual(listEnterCleanupRanges(state), [{ from: 5, to: 7 }]);
});

test("尾随段落只装 hardbreak（渲染出的 <br>）→ 同样删除", () => {
  // para(hb) 占 [5,8)
  const state = stateInItem([para(text("甲")), para(hb())], 0);
  assert.deepEqual(listEnterCleanupRanges(state), [{ from: 5, to: 8 }]);
});

test("垃圾块之后还有真实段落 → 只删垃圾块，不碰真内容", () => {
  const state = stateInItem([para(text("甲")), para(), para(text("真内容"))], 0);
  assert.deepEqual(listEnterCleanupRanges(state), [{ from: 5, to: 7 }]);
});

test("尾随嵌套列表不是垃圾 → 不删", () => {
  const state = stateInItem([para(), nestedList()], 0);
  assert.deepEqual(listEnterCleanupRanges(state), []);
});

test("光标段只装 hardbreak → 清成空段落", () => {
  // para(hb,hb) 内容 [3,5)
  const state = stateInItem([para(hb(), hb())], 0);
  assert.deepEqual(listEnterCleanupRanges(state), [{ from: 3, to: 5 }]);
});

test("光标段是 hardbreak 且后面还有空段 → 内容 + 尾随段一起删", () => {
  // para(hb) 占 [2,5)，内容 [3,4)；空 para 占 [5,7)
  const state = stateInItem([para(hb()), para()], 0);
  assert.deepEqual(listEnterCleanupRanges(state), [
    { from: 5, to: 7 },
    { from: 3, to: 4 },
  ]);
});

test("光标在块首且段首是连续 hardbreak → 剥掉前导 hardbreak，保留正文", () => {
  // para(hb,hb,"内容") 内容从 3 起，前两个 hardbreak 占 [3,5)
  const state = stateInItem([para(hb(), hb(), text("内容"))], 0, 0);
  assert.deepEqual(listEnterCleanupRanges(state), [{ from: 3, to: 5 }]);
});

test("光标不在块首 → 前导 hardbreak 不动（正文中间不删）", () => {
  const state = stateInItem([para(hb(), text("内容"))], 0, 1);
  assert.deepEqual(listEnterCleanupRanges(state), []);
});

test("Enter 遇到脏结构：倒序删除、dispatch 后返回 false 交还原生 keymap 链", () => {
  const state = stateInItem([para(hb()), para()], 0);
  const { view, deletes, dispatched } = makeView(state);
  assert.equal(guardListEnterKeydown(view, enter), false);
  // 先删坐标大的尾随空段 [5,7)，再删段内 hardbreak [3,4)
  assert.deepEqual(deletes, [
    [5, 7],
    [3, 4],
  ]);
  assert.equal(dispatched(), 1);
});

test("干净的 Enter → 不动文档，直接放行", () => {
  const state = stateInItem([para(text("甲"))], 0);
  const { view, dispatched } = makeView(state);
  assert.equal(guardListEnterKeydown(view, enter), false);
  assert.equal(dispatched(), 0);
});

test("Shift-Enter 交给 InsertHardbreak，不清洗", () => {
  const state = stateInItem([para(hb()), para()], 0);
  const { view, dispatched } = makeView(state);
  assert.equal(guardListEnterKeydown(view, { ...enter, shiftKey: true }), false);
  assert.equal(dispatched(), 0);
});

test("非 Enter 按键不拦截", () => {
  const state = stateInItem([para(hb()), para()], 0);
  const { view, dispatched } = makeView(state);
  assert.equal(guardListEnterKeydown(view, { ...enter, key: "a" }), false);
  assert.equal(dispatched(), 0);
});
