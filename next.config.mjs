/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Verification builds use a separate output directory so an active dev server keeps its .next state.
  ...(process.env.STUDYSOLO_BUILD_DIR === ".next-class-verify"
    ? { distDir: ".next-class-verify" }
    : {}),
  // Next 16 默认拦截跨源访问 dev 资源（/_next/webpack-hmr、__nextjs_font 等）。
  // 经反向代理/IDE 预览（如 127.0.0.1 的预览端口）访问时，HMR 会 502、字体 403，
  // 进而导致页面无法水合。放行本机来源即可正常开发。
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // 桌面打包(Electron)：仅当 BUILD_STANDALONE=1 时产出自包含 standalone server，
  // 并关闭图片优化(免 sharp 原生依赖，便于离线打包)。Web/本地构建不受影响。
  ...(process.env.BUILD_STANDALONE === "1"
    ? { output: "standalone", images: { unoptimized: true } }
    : {}),
  // content/ 下的笔记与检索索引随 standalone 落盘（自托管 / 桌面）。
  // _raw 与 examples 仍排除以控制体积。
  outputFileTracingIncludes: {
    "/api/**": ["./content/**/*", "./lib/ai/prompts/**/*"],
  },
  outputFileTracingExcludes: {
    "/api/**": ["./content/_raw/**/*", "./content/examples/**/*"],
  },
  // 重型依赖按需加载，减少首屏 bundle 体积。lucide-react 有 18 处具名图标导入，
  // 加入后 Next 会把 barrel 导入改写为按图标深层导入，显著减小图标库体积。
  // 注意：katex 不可加入——它靠 `import "katex/contrib/mhchem"` 的副作用给 katex 单例打补丁，
  // barrel 优化的深层导入改写会破坏该单例关系，导致 SSR 包里 mhchem 的气体箭头 `^`、三键 `#`
  // 等惰性特性失效（\ce{N2 ^}、\ce{-C#CH} 渲染成红字错误），而 node 直跑无此改写故正常。
  transpilePackages: ["pdfjs-dist", "docx-preview", "pptx-preview", "@milkdown/crepe", "@milkdown/kit"],
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react"],
  },
};

export default nextConfig;
