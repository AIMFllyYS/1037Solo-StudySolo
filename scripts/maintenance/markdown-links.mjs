import { unified } from "unified";
import remarkParse from "remark-parse";

/**
 * Extract actual Markdown links/images, including references, without treating code examples as links.
 * @param {string} markdown
 * @returns {{ target: string; line: number; kind: string }[]}
 */
export function markdownLinks(markdown) {
  const tree = unified().use(remarkParse).parse(markdown);
  const definitions = new Map();
  const links = [];
  function visit(node, action) {
    action(node);
    if (Array.isArray(node.children)) for (const child of node.children) visit(child, action);
  }
  visit(tree, node => {
    if (node.type === "definition") definitions.set(node.identifier, node.url);
  });
  visit(tree, node => {
    const direct = node.type === "link" || node.type === "image";
    const reference = node.type === "linkReference" || node.type === "imageReference";
    const target = direct ? node.url : reference ? definitions.get(node.identifier) : undefined;
    if (typeof target === "string") links.push({ target, line: node.position?.start.line ?? 1, kind: node.type });
  });
  return links;
}
