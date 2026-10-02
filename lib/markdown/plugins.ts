import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import latex from "highlight.js/lib/languages/latex";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import "katex/contrib/mhchem";
import remarkDirectives from "./remarkDirectives";
import remarkCalloutSoftBreaks from "./remarkCalloutSoftBreaks";
import { markdownSanitizeSchema } from "./sanitizeSchema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sharedRemarkPlugins: any[] = [
  remarkGfm,
  remarkMath,
  remarkDirective,
  remarkDirectives,
  remarkCalloutSoftBreaks,
];

// rehype-raw must precede sanitize (so raw HTML is parsed into elements
// that can be stripped) and precede rehype-katex (so math delimiters still
// see a complete tree). Sanitize itself must precede katex/highlight so
// trusted plugin output is not re-filtered.
//
// rehype-highlight 的 detect:true 会让 highlight.js 对每个未标语言的 fence 遍历所有 grammar
// 做自动识别——对概率论/物理这种"整卷 KaTeX 但几乎无代码块"的内容来说是纯浪费。
// 现在改为 detect:false，仅在作者显式写 ```lang 时才高亮；未标语言的 fence 保持原样即可。
// Explicit grammar registration keeps the common-language bundle out of chat/SSR.
const highlightLanguages = { bash, c, cpp, css, java, javascript, json, latex, markdown, python, typescript, xml };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sharedRehypePlugins: any[] = [
  rehypeRaw,
  [rehypeSanitize, markdownSanitizeSchema],
  [rehypeKatex, { throwOnError: false, strict: false }],
  [
    rehypeHighlight,
    {
      detect: false,
      ignoreMissing: true,
      languages: highlightLanguages,
      aliases: { js: "javascript", ts: "typescript", sh: "bash", shell: "bash", html: "xml", svg: "xml", md: "markdown", tex: "latex" },
    },
  ],
];
