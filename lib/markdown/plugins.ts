import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
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
// subset 只限制自动识别的候选语言；detect:false 时不参与识别，也不会裁剪 grammar bundle。
// 真正限制注册语言需显式传 languages，并以构建产物验证体积变化。
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
      subset: [
        "python",
        "javascript",
        "typescript",
        "bash",
        "shell",
        "json",
        "html",
        "css",
        "markdown",
      ],
    },
  ],
];
