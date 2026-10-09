# StudySolo 宣传片 · 代码视频复盘

> 成片：`promo/studysolo-promo.mp4`（当前为 v2：60 秒浅色版，59.95MB；本文一至四节记录的是 v1：57 秒深色版，84MB）
> 源码：`promo/`（分支 `claude/fervent-newton-m0cres`）
> 制作时间：2026-09-25 11:54 – 13:20 UTC，约 86 分钟（4 核 / 15GB 内存的云端容器，无 GPU）
> 本文只记录这次真实发生的做法、参数和问题，用于下次直接复用。

---

## 一、创作思路

### 1. 需求拆解成叙事结构

**原始需求里的硬约束**
- 30–60 秒，横屏，节奏快，要有叙事感，转场自然（最好一镜到底或有主线）。
- 必须使用项目真实页面，系统地展示功能。
- 给出的参考叙事：过去翻书翻到夕阳落山 → 现在有 Agent，一下子找到并理解；用左右对比窗口呈现。
- 目标观众：普通人和对 AI 反感的人，看完想开通会员。

**拆解方法：先找一个能贯穿全片的问题。**
项目是医学生的复习工作站，内容横跨 13 个学科。我在仓库里用 `grep` 找一个同时满足三点的知识点：
1. 普通人一听就好奇；
2. 答案必须跨多本教材才能拼完整（这样“翻书”才有戏剧性）；
3. 教材原文里有能直接截图作证的句子。

最后选定 **「为什么糖尿病人的呼吸，会有烂苹果味？」**：
- 组胚 `histology/textbook/ch15-4`：胰岛 B 细胞被破坏 → 胰岛素不足；
- 生化 `biochemistry/textbook/ch08-3`：脂肪动员 → β-氧化 → 乙酰 CoA 堆积 → 酮体，原文写着“丙酮经呼吸道，有‘烂苹果气味’”；
- 生化 `ch07-6`：糖异生、草酰乙酸不足；
- 系解 `anatomy/textbook/ch02-2`：胰的位置。

这个问题同时是开场钩子、过去段的困境、现在段的演示、三维段的因果链、结尾的回扣，全片只讲这一件事。

**情绪曲线 → 时间段 → 镜头**（120 BPM，1 拍 = 0.5 秒，1 小节 = 2 秒，所有关键点都落在拍点上）

| 时间 | 幕 | 情绪 | 镜头与画面 |
|---|---|---|---|
| 0–4s | 钩子 | 悬念、安静 | 黑色监护屏，心电线在第 1、1.5、2 秒三次跳动（落拍），问题逐字浮现 |
| 4–15s | 过去 | 焦虑，逐渐加速 | 手绘书桌；镜头切换从 1 秒一次加速到 0.25 秒一次；翻页间隔从 0.95 秒缩到 0.17 秒；太阳落山，台灯亮起 |
| 15–24s | 过去 \| 现在 | 释放、对比 | 冲击音 + 白闪，发光分割线扫入；左边继续翻书，右边真实 Agent 6 秒作答 |
| 24–33s | 那根线 | 理解、上扬 | three.js 一镜到底：来源卡片飞出，展开成教材页，发光线逐个点亮因果节点，终点落在“烂苹果味” |
| 33–44s | 功能蒙太奇 | 兴奋、满拍 | 9 个功能按拍切换，coverflow 滑动 + 运动模糊 |
| 44–47s | 数字 | 力量感 | 5 个真实统计数字逐拍砸入 |
| 47–57s | 结尾 | 温暖、收束 | 回到同一张书桌，“今天，太阳还没落山”；推进太阳白化；心跳线收束成品牌标志、口号、CTA |

### 2. 各段设计意图

- **开场（心电线）**：医学主题最直接的视觉符号，用一条线开场，信息量低、悬念高。心电线的**基线 y=750 与下一场书桌边缘重合**，心电的波峰被压平后，这条线直接变成书桌，从而“一条线”成为全片主线：心电线 → 书桌 → 分屏分割线 → 三维发光因果线 → 结尾心跳线 → 品牌标志。
- **过去（手绘）**：用暖色纸张、铅笔质感表现“旧方法”，和后面冷色、精确的真实界面形成材质对比，不用旁白观众也能分清两个时代。所有焦虑元素都**由时间驱动**：钟表从 14:00 转到 21:47、窗外天色从白天变成夜晚、书从 3 本堆到 9 本、便利贴贴满墙并出现红色问号，最后台灯亮起。字幕“知识从不缺席，缺的是那根线”给后面的三维段埋伏笔。
- **转场到现在**：15.0 秒是全片第一个重拍，同时给出冲击音、白闪、漏光，以及从屏幕右侧扫入的发光分割线。分割线就是“那根线”的第一次出现。
- **分屏对比**：左侧没有停止，继续翻书，计时器显示“7 小时 47 分……”；右侧真实界面依次经历打字、思考、检索 3 本教材、作答、标注出处。顶部的步骤标签（思考 / 检索 / 作答 / 标注出处）把 Agent 的过程翻译成普通人能看懂的语言。分割线先停在中间，Agent 开始工作时移到 760 像素处，最后把“过去”推出画面，这个动作本身就是叙事。
- **三维因果线（高潮一）**：针对“对 AI 反感的人”最关心的问题——AI 会不会乱编？这里让答案里的 4 条引用变成实物，飞回对应的真实教材页，逐句高亮出处，字幕“每一句，都回到你的课本”。这一段是可信度的论证，而不只是炫技。
- **功能蒙太奇（高潮二）**：信息密度最高的段落，每个功能只给 1–2 拍，配一句 6–8 个字的利益点文案（例如“读到哪，问到哪”“公式，可以上手拖”），加上编号 01/09 和进度条，让观众知道内容有限、不会拖沓。
- **数字**：只用仓库里能统计出来的真实数字（`find content -name '*.md'`、quiz JSON 题数、nav 条目数、media manifest 条数），防止营销夸大。
- **结尾**：回到同一张书桌、同一扇窗，但太阳还没落山，笔记本电脑屏幕上显示的是真实 Agent 回答的截图，便利贴写着“✓ 酮体 · 已理解 17:20”。这是对“夕阳都落山了还没翻到”的直接回应，情感上完成闭环。最后推进太阳白化，切到心跳线，品牌标志和 CTA 收尾。

### 3. 节奏、剪辑与音画配合技巧

- **全片锁定 120 BPM**：镜头切换、字幕入场、节点点亮、数字砸入都放在 0.5 秒整数倍上；音频合成用同一个网格，“卡点”由设计保证，而不是事后对齐。
- **加速剪辑制造焦虑**：过去段的镜头时长从 1.0 → 0.25 秒，翻页间隔 `lerp(0.95, 0.17, k^1.25)`，钟表滴答从四分音符 → 八分音符 → 十六分音符，三者同步加速，再用上升音效推到 15 秒爆点。
- **匹配剪辑 / 形状延续**：心电线 → 书桌线；分割线 → 三维发光线；太阳白化 → 结尾暗场心跳线。每次转场都有一个“同一个东西”在前后画面里，所以转场不突兀。
- **同一相机坐标交接**：DOM 窗口最终停在 `WIN_FULL = {cx:960, cy:548, w:1760, h:990}`；three.js 相机按 `D = (H/2)/tan(FOV/2)` 放置，使 z=0 平面上 1 个世界单位 = 1 像素，同一张截图贴在同一个位置。24.0 秒从 DOM 切到 WebGL，肉眼看不出切换。
- **逐字入场**：每个字 `opacity + translateY(34px→0) + blur(14px→0) + scale(1.08→1)`，每字错开 35ms；退场先模糊上移。中英双层字幕：中文主标题 + 小号大写英文副标题（字间距 0.28em），这是高级广告片的常见排版。
- **数码推拉镜头**：真实界面截图在窗口内做缩放平移（打字时 2.5 倍对准输入框，来源出现时 2.45 倍对准来源面板），模拟摄影机的推拉摇移，同时解决了“界面太小看不清”的问题。
- **运动模糊**：蒙太奇里根据相机速度 `vel` 给整个世界加 `blur(min(10, |vel|*0.9)px)`，快速横移时有甩镜效果。
- **呼吸感**：22.4–24 秒鼓组全部停掉，只保留铺底和标题“从翻找，到理解”；47–50.8 秒只留钢琴。高潮之前先留白。
- **侧链压缩**：所有音乐轨道在每次底鼓后压低 55%（`1 - 0.55*exp(-t*11)`），产生电子乐的“呼吸泵感”，也让底鼓更清楚。

---

## 二、具体的创作方式

### 1. 技术栈与整体工作流

| 环节 | 工具 |
|---|---|
| 运行真实应用 | `pnpm install --frozen-lockfile` + `pnpm dev`（Next.js 16，端口 35349） |
| 采集真实页面 | Playwright 1.56.1 + 预装 Chromium（`/opt/pw-browsers`），视口 1600×900，`deviceScaleFactor: 2` → 3200×1800 截图 |
| 伪造 AI 流 | `context.addInitScript` 覆写 `window.fetch`，按 AI SDK UI Message Stream（SSE）协议逐块推送 |
| 影片渲染器 | 纯浏览器页面：DOM + SVG（手绘）+ CSS 3D（蒙太奇）+ three.js 0.170（EffectComposer + UnrealBloomPass） |
| 逐帧截图 | Playwright + CDP `Page.captureScreenshot`（JPEG q95），3 个进程并行 |
| 字体 | Google Fonts 的 CSS 与 311 个 woff2 子集下载到本地（14.3MB） |
| 素材预处理 | Python + Pillow（缩图、裁切、程序化纸张纹理） |
| 配乐与音效 | Python + numpy + scipy（`butter`/`sosfilt`/`fftconvolve`），48kHz 立体声 |
| 编码 | `pip install imageio-ffmpeg`（自带 ffmpeg 7.0.2 + libx264） |
| 审片 | 渲染单帧 → Pillow 拼接成带时间码的缩略图网格，用 Read 看图 |

**完整步骤**
1. 读 README / 目录结构 / 路由 / 内容树，理解产品是什么（约 5 分钟）。
2. 选贯穿全片的问题，用 `grep` 在教材里找证据。
3. 启动应用，批量截图，看整体视觉风格。
4. 写分镜表（时间、情绪、镜头、字幕、音效）。
5. 采集：静态页、流式回答逐帧、划词逐帧、交互组件逐帧，并导出关键文字的像素坐标。
6. 写渲染器：一幕一个模块，每写完一幕就渲染 8–12 张预览帧并拼图检查。
7. 全片渲染（3 进程并行），同时写音频合成。
8. 编码初版 → 看转场缩略图 → 修改 → 只重渲受影响的帧区间 → 编码终版。
9. 源码入库、成片交付。

### 2. 项目结构与关键模块

```
promo/
├── capture/            # 采集（CommonJS，node 运行，cwd = promo/）
│   ├── inject.js       # 页面内 fetch 覆写：/api/chat 返回可推送的 ReadableStream
│   ├── chatscript.js   # 回答脚本：reasoning → searchNotes 工具 → 正文，拆成 134 个 chunk
│   ├── cap_agent.js    # 逐 chunk 推送 + 逐帧截图（agent / studio 两种模式）
│   ├── cap_pages.js / cap_sel.js / cap_misc.js / cap_more.js / cap_inter.js / cap_quiz*.js / shot2.js
│   └── rects.js / srcrects.js   # 导出界面元素、教材高亮文字的像素坐标
├── film/
│   ├── index.html      # 1920×1080 舞台 + importmap（three）
│   └── js/
│       ├── core.js     # 缓动、track 关键帧、种子随机数、noise1、el/svg 构造、事件表 ev()
│       ├── main.js     # 导演：图层顺序、字幕表、FX 时间表、window.renderAt / ready / getEvents
│       ├── hook.js     # 第一幕 心电线
│       ├── past.js     # 第二幕 手绘书桌（结尾复用 variant: "finale"）
│       ├── split.js    # 第三幕 分屏
│       ├── three-acts.js  # 第四幕 三维因果线
│       ├── montage.js  # 第五幕 蒙太奇
│       ├── stats.js    # 数字
│       ├── finale.js   # 结尾
│       ├── captions.js # 逐字动画字幕
│       └── fx.js       # 颗粒、暗角、白闪、漏光、黑场
├── make_assets.py      # 缩图、来源卡裁切、纸张纹理、字体本地化
├── render.js           # 分段逐帧渲染
├── preview.js / sheet.py  # 单帧预览 + 缩略图拼接
└── audio.py            # 读取 events.json 合成 score.wav
```

**核心 1：确定性渲染（整套方法的地基）**
每个场景都是时间 t 的纯函数，禁止使用 CSS transition / animation、`requestAnimationFrame` 和 `Date.now()`。这样任意帧都能单独重渲、分段并行，修改后只需重渲受影响的区间。

```js
// main.js
window.renderAt = async function renderAt(t, frame) {
  hook.render(t);
  past.setCamera(pastCamera(t)); past.render(t, { frame });
  await split.render(t, frame);   // 内部会 await img.decode()
  await s3d.render(t, frame);     // composer.render()
  await montage.render(t, frame);
  stats.render(t); await finale.render(t, frame);
  caps.render(t); fx.render(t, frame);
};
window.ready = (async () => { /* 预加载所有字重 + 图片 */ await document.fonts.ready; ... })();
```

```js
// core.js：关键帧轨道，驱动所有镜头
export function track(keys, t) {           // [[t, value|array, easeFn?], ...]
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, fn] = keys[i], [t0, v0] = keys[i - 1];
    if (t <= t1) { const p = (fn || E.inOutCubic)(seg(t, t0, t1));
      return Array.isArray(v0) ? v0.map((x, j) => lerp(x, v1[j], p)) : lerp(v0, v1, p); }
  }
  return keys[keys.length - 1][1];
}
```

**核心 2：让真实界面“真的”流式渲染一段回答**

```js
// inject.js（addInitScript 注入，先于应用自身的 fetch 包装执行）
const orig = window.fetch;
window.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : input.url;
  if (/\/api\/chat(\?|$)/.test(url)) {
    let ctrl; const stream = new ReadableStream({ start(c) { ctrl = c; } });
    const enc = new TextEncoder();
    window.__push = (objs) => { for (const o of objs) ctrl.enqueue(enc.encode(
      o === 'DONE' ? 'data: [DONE]\n\n' : 'data: ' + JSON.stringify(o) + '\n\n')); };
    window.__end = () => ctrl.close(); window.__chatOpen = true;
    return Promise.resolve(new Response(stream, { status: 200, headers: {
      'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } }));
  }
  return orig.apply(this, arguments);
};
```

chunk 类型顺序：`start` → `start-step` → `reasoning-start/delta/end` → `tool-input-start` → `tool-input-available` → `tool-output-available`（`{text, hits:[{title,path,snippet,kind,subjectId,citeIndex}]}`）→ `finish-step` → `start-step` → `text-start` → `text-delta`×N → `text-end` → `finish-step` → `finish` → `[DONE]`。
采集时每推 1 个 chunk 等 50ms（工具类 250ms）再截图一次：agent 169 帧，studio 198 帧。合成时再用关键帧表把帧号映射到影片时间（例如 `[18.55, 49] … [21.35, 147]`），所以流式速度可以在后期任意压缩或拉伸。

**核心 3：分段并行渲染**

```js
// render.js（node render.js <开始帧> <结束帧> frames）
await p.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
await p.evaluate(() => window.ready);
const cdp = await p.context().newCDPSession(p);
for (let f = a; f < b; f++) {
  if (fs.existsSync(file)) continue;                    // 断点续渲 / 只重渲删除掉的帧
  await p.evaluate(async (f) => { await window.renderAt(f / 60, f); }, f);
  const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
}
```

**核心 4：声音事件由画面代码导出，天然同步**

```js
// 画面代码里在构造时登记事件
for (const f of FLIPS) ev(f.t, "flip", { pane: f.t < 15 ? "full" : "left" });
for (let i = 2; i <= 19; i++) ev(lerp(15.68, 16.9, (i - 2) / 17), "key", { i });
ev(n.t, n.final ? "node-final" : "node", { i: idx });
// render.js 第 0 段导出：fs.writeFileSync('events.json', await p.evaluate(() => window.getEvents()))
```

### 3. 每种视觉风格的实现

**A. 监护屏心电线（hook.js）**
- 背景：径向渐变 `#0d1a22 → #040507` + 48px 网格（`linear-gradient` 双向 1px 线，`mask-image` 径向淡出）。
- 波形：分段函数 `ecgOffset(x)` 生成 P、Q、R、S、T 波；每 3px 采样一个点拼成 SVG path。R 波峰值 x = 657 / 1122 / 1588，正好对应扫描头在 1.0 / 1.5 / 2.0 秒经过的位置。
- 发光：同一条 path 画两遍，底层 `feGaussianBlur stdDeviation=7` 的青色粗线，上层 `linearGradient`（userSpaceOnUse，随扫描头移动）实现“尾迹渐隐”；扫描头是带模糊的白色圆点。
- 转场：3.55–4.05 秒波幅乘以 `1-ease` 压平，颜色插值到墨色 `#2a2119`；纸张层用 `clip-path: inset(top 0 bottom 0)` 从这条线向上下展开。

**B. 手绘动画（past.js，纯 SVG）**
- 粗糙线条：`roughLine` 在中点加法向抖动 + 端点过冲，用二次贝塞尔；`roughEllipseD` 用 14 个抖动点 + 过冲 25% 的 Catmull-Rom。每条线额外画一条 0.45 倍粗细、偏移 (1.4, -1.1) 的“第二笔”。
- 沸腾线：整组墨线挂一个 `feTurbulence(fractalNoise, baseFrequency 0.018) + feDisplacementMap(scale 3.2)` 滤镜，**每 5 帧换一次 seed**（60fps 下相当于 12fps），这是手绘动画“线在呼吸”的关键。
- 描线出现：`pathLength=1` + `stroke-dasharray: 1 1` + `stroke-dashoffset: 1-p`。
- 纸张：Pillow + numpy 程序化生成（低频斑驳 + 中频 + 颗粒 + 1400 根纤维 + 3 个咖啡渍圆环 + 暗角），2600×1500 JPEG，放在相机组最底层并放大到 3320×1915，缩放镜头时不会露边。
- 翻页：页边 `xe = 980 + 262·cos θ`，抬起 `lift = 86·sin θ`，二次贝塞尔构造页面形状；明暗 `0.72 + 0.28·|cos θ|`；页面上的文字线条按双线性插值贴在页面四边形上。
- 天色：`gradientAt` 在 5 个色标之间插值（`#f4e3a6 → #f0a760 → #b8567a → #3a2d5c → #161b3d`），太阳 y 值按 `inQuad` 下落，星星在进度 > 0.82 后出现。
- 夜晚：整张画面盖一层 `#10163a`、`mix-blend-mode: multiply`，透明度 0 → 0.62；台灯光锥用径向渐变 + `screen` 混合，在 14.1–14.2 秒闪两下再点亮。
- 相机：`<g transform="translate(sx,sy) rotate(r) scale(s) translate(-cx,-cy)">`；镜头表 `SHOTS=[t0,t1,cx,cy,s0,s1,rot]`；手持晃动用 `noise1`；落书时加衰减正弦震动。

**C. 真实界面分屏（split.js）**
- 左侧复用同一个 `PastScene` 实例，只换相机（`sx = divider/2`，让画面始终居中在剩余宽度里）并用 `clip-path: inset(0 W-div 0 0)` 裁切。
- 右侧：深蓝径向渐变 + 两个缓慢漂移的模糊光斑 + 点阵网格；窗口 `border-radius 18px`，多层阴影加蓝色外发光；进场带 `rotateY(-8°→0)`。
- 窗内推拉：`ix = ww/2 - fx/1600·iw`，并 clamp 在 `[ww-iw, 0]`，保证不露出截图边缘。
- 图片序列：每帧只设置当前帧的 `src` 并 `await img.decode()`，不整体预载。

**D. three.js 三维（three-acts.js）**
- `WebGLRenderer({ antialias, preserveDrawingBuffer: true })`，`NoToneMapping` + `SRGBColorSpace`；`UnrealBloomPass(strength 0.75–1.1, radius 0.55, threshold 0.92)`。
- 发光线和节点颜色用 **> 1 的 HDR 值**（如 `Color(1.8, 2.4, 4.0)`），截图纹理 ≤ 1，所以只有线和节点会触发泛光，截图不会糊。
- 发光线：`CatmullRomCurve3(centripetal)` + 两根 `TubeGeometry`（半径 3.2 的实芯 + 半径 13、加法混合、0.22 透明度的光晕）；绘制进度用 `setDrawRange`。曲线按下标参数 `getPoint(k/(n-1))` 精确经过节点，而管道按弧长采样，所以预先算 3000 点累计弧长表，把“下标参数”换算成“弧长比例”。
- 圆角纹理：用 canvas 画 `roundRect` 作为 `alphaMap`。
- 节点标签：DOM 叠加，每帧 `Vector3.project(camera)` 换算成屏幕坐标。
- 高亮框：`LineLoop` + 加法混合的半透明面，挂在页面 group 下，坐标来自 `srcrects.js` 导出的真实文字位置（`(x+w/2-800)*0.8, -(y+h/2-450)*0.8`）。

**E. 蒙太奇（montage.js，CSS 3D）**
- `perspective: 2200px`；每张屏幕按与相机的偏移 d 计算 `translate3d(d·1178px, 0, -|d|·520px) rotateY(clamp(d)·-38°)`，形成 coverflow。
- 相机 x = 所有切点 `E.inOutExpo(seg(t, cut-0.2, cut+0.12))` 之和，保证正好在拍点上完成切换。
- 左下角压一层径向暗化，再放编号、大标题（Noto Sans SC 900，88px）、英文副标题和 9 格进度条。

**F. 字幕与全局质感（captions.js / fx.js）**
- 字幕样式：`ink`（纸上墨字）、`light`、`hero`（104px）；方括号 `[词]` 自动换成强调色，可带辉光。
- 颗粒：6 张 384×384 的随机噪声 dataURL，按帧号轮换并随机偏移 `background-position`，`mix-blend-mode: overlay`，透明度 0.075（手绘段 0.11）。
- 白闪 / 漏光 / 黑场都是按时间表计算透明度的全屏层。

### 4. 音频处理（audio.py）

- **全部程序化合成**，没有使用任何外部素材：
  - 钢琴：7 个略失谐的泛音正弦，高次泛音衰减更快，加一点锤击噪声，5kHz 低通；
  - pluck：两路失谐锯齿波 + 衰减低通 + 基频正弦；
  - pad：每个音 5 路失谐锯齿波，左右声像展开，低通 700–3500Hz，慢起慢收，加 0.3Hz 颤音；
  - 钟声：FM 合成（调制比 3.5，调制指数随时间衰减）；
  - 底鼓：45+110·e^(-32t) Hz 的扫频正弦，加 tanh 失真和点击声；拍手：3 次短噪声 + 带通；踩镲：7.5kHz 高通噪声；
  - 冲击：55→30Hz 扫频 sub + 高通噪声镲片；上升音：噪声带通扫频 + 锯齿音高上扬；反向镲片：镲片数组倒序。
- **拟音**：翻页（1.4–7kHz 带通噪声 + 双峰高斯包络，每次长度和音量随机）、铅笔涂写（带通噪声 × 9–12Hz 幅度调制）、落书（70Hz 衰减正弦 + 低通噪声）、键盘（高通噪声 + 3kHz 短音）、心电“嘀”（988Hz 正弦 130ms）、心跳（52Hz + 延迟 0.19 秒的 64Hz）。
- **卡点**：`events.json` 里 165 个事件（61 次翻页、18 次按键、22 次数据滴答、6 个节点等）逐个映射成音效。因果节点按五声音阶 C–D–E–G–A–C 上行，最后一个节点用大三和弦钟声 + sub 冲击。
- **配乐编排**：
  - 0–4 秒：A 小调低音铺底 + 倒放钢琴和弦；
  - 4–15 秒：Am–F–Dm–E 八分音符钢琴琶音（12 秒后变成十六分音符）+ 钟表滴答加速；
  - 15 秒起转到 C 大调：F–G–Em–Am–F，17 秒按下回车后进入底鼓和琶音；
  - 25 秒起完整鼓组；32–33 秒军鼓加花 + 上升音 + 反向镲片；33 秒落地；
  - 44–47 秒数字段：每拍一个和弦重击（C、Em、F、G、Am）；
  - 47 秒起只留钢琴；53.05 秒品牌标志落地时，Cadd9 长和弦 + sub + 钟声，钢琴 E–G–C–D–E 回响。
- **混音**：音乐总线侧链（压缩 55%）；混响用两路独立噪声 × e^(-2.6t)、2.4 秒、20ms 预延迟的冲激响应，经 `fftconvolve` 生成；25Hz 高通；`tanh(1.15x)` 软削波；归一化到峰值 0.93；56.2 秒起指数淡出，和画面 56.2–57 秒黑场同步。
- 成品指标：峰值（归一化前）1.19，RMS −14.2 dBFS，合成耗时 10.5 秒。

### 5. 渲染与导出命令

```bash
# 素材服务（渲染器通过 http 加载，避免 file:// 下 ES module / CORS 问题）
cd film && python3 -m http.server 8765 &

# 57 秒 × 60fps = 3420 帧，3 段并行
node render.js 0 1140 frames & node render.js 1140 2280 frames & node render.js 2280 3420 frames &

python3 audio.py        # → score.wav（48kHz / 16bit / 57.4 秒）

FF=$(python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())")
# 初版（CRF 17）：274.6MB / 38.5Mbps，太大
# 终版：
$FF -framerate 60 -i frames/%05d.jpg -i score.wav \
  -c:v libx264 -preset slow -crf 21 -tune film -pix_fmt yuv420p -profile:v high -level 4.2 \
  -c:a aac -b:a 256k -shortest -movflags +faststart \
  -metadata title="StudySolo · 把书海，变成一次提问" studysolo-promo.mp4      # 84MB
```

- 分辨率 1920×1080，DPR 1，60fps；`-shortest` 让音频（57.4 秒）截齐到画面 57.00 秒。
- `yuv420p` + `high` profile + `+faststart`：保证手机和浏览器都能直接播放、边下边播。
- **压到可分享体积**：这次用户选择 GitHub 链接，没有另外压缩。如果需要 < 30MiB（对话附件上限），推荐两遍编码：`-b:v 3800k -pass 1/2 -preset slower -tune film` + `-b:a 192k`，57 秒约 28MB；或者降到 30fps / 降低颗粒强度。

### 6. 时间分配（真实时间戳）

| 阶段 | 时间 | 用时 |
|---|---|---|
| 读项目、装依赖、启动应用 | 11:54–11:56 | 约 3 分钟（`pnpm install` 14 秒，首次编译 29.5 秒） |
| 真实页面采集（含流式回答方案探索） | 11:56–12:16 | 约 20 分钟 |
| 渲染器编写 + 分幕预览 | 12:17–12:40 | 约 23 分钟 |
| 全片渲染（3 进程） | 12:40–13:00 | 约 20 分钟（音频在此期间写完） |
| 初版编码 + 审片 + 修改 | 13:00–13:04 | 约 4 分钟 |
| 重渲 776 帧 + 终版编码 | 13:04–13:14 | 约 10 分钟 |
| 入库、推送、交付 | 13:14–13:20 | 约 6 分钟 |

**最耗时的环节**：逐帧截图。PNG 截图每帧 1.3–2.1 秒，改成 JPEG 后 0.2–0.4 秒；3D 段因为用 SwiftShader 软件渲染 + bloom，每帧 1.4–3 秒。
**提速方法**：
1. 一开始就用 CDP 的 JPEG 截图；
2. 按帧区间并行（受 CPU 核数限制，4 核开 3 个进程）；
3. 帧已存在就跳过，改完只删、只重渲受影响的区间；
4. 预览时只渲关键时刻并拼图，不要为了看一眼去渲整段；
5. 有 GPU 的机器用硬件 WebGL；
6. 3D 段的 bloom 可以降到半分辨率。

---

## 三、注意事项与踩过的坑

### 1. 逐项检查清单

**开工前**
- [ ] 目标时长、画幅（横 / 竖）、帧率（30 / 60）、是否需要声音、交付渠道和体积上限（对话附件 30MiB；GitHub 单文件 50MB 警告、100MB 硬上限）。
- [ ] 真实应用能在本地跑起来吗？需要登录或 API 密钥吗？没有密钥时 AI 回答怎么呈现（脚本化，并在交付时说明）？
- [ ] 找到贯穿全片的一个问题 / 一个用户故事，并在代码库里找到可以截图作证的原文。
- [ ] 所有要展示的数字都能从仓库统计出来（写下统计命令）。
- [ ] 环境检查：`ffmpeg -encoders | grep libx264`（Playwright 自带的 ffmpeg 只有 vp8）、`fc-list :lang=zh`（中文字体）、`nproc`、磁盘空间、WebGL 渲染器（`UNMASKED_RENDERER_WEBGL`）。
- [ ] 确定 BPM，把所有关键时刻写成拍点表。

**制作中**
- [ ] 渲染器必须是 `renderAt(t)` 的纯函数：不用 CSS 动画、rAF、`Date.now()`、`Math.random()`（用种子随机数）。
- [ ] 字体本地化，并在 `ready` 里预热所有字重和所用字符。
- [ ] 截图采集隐藏开发工具浮标（Next.js 用 `nextjs-portal{display:none}`）、光标（`caret-color: transparent`）。
- [ ] 流式界面的公式、表格、代码块要整块下发，避免中间态报错。
- [ ] 界面上显示的实时计时（“已处理 N 秒”）要处理。
- [ ] 每写完一幕，预览 8–12 帧并拼图检查：字幕是否压在复杂背景上、文字是否可读、元素是否重叠。
- [ ] 每个转场前后各看 3–5 帧（t−0.2 … t+0.2），确认形状和位置延续。
- [ ] 所有需要声音的时刻都在代码里 `ev()` 登记。

**导出前**
- [ ] 帧数 = 时长 × fps（`ls frames | wc -l`），没有缺帧。
- [ ] 音频长度 ≥ 画面长度，用 `-shortest` 截齐；首尾淡入淡出和画面黑场一致。
- [ ] 音频画了响度 / 频谱图：结构是否对应各幕、是否有意外静音或削波。
- [ ] 抽查转场缩略图（每个转场前后 5 帧）。
- [ ] 编码参数：`yuv420p`、`+faststart`、`high` profile；先用 CRF 估算体积。

**交付前**
- [ ] 文件体积满足渠道上限；超过就准备好替代方案（GitHub 分支 / Release / 两遍编码压缩版）。
- [ ] `ffmpeg -i` 确认时长、分辨率、帧率、音轨。
- [ ] 如实说明哪些内容是脚本化的（AI 回答文本、计时数字），哪些没有验证（配乐没有试听）。
- [ ] 源码入库，素材和中间产物加入 `.gitignore`；仓库的 lint 忽略这个目录；README 写清复现命令。

### 2. 踩过的坑

| # | 现象 | 根本原因 | 解决 | 下次如何避免 |
|---|---|---|---|---|
| 1 | 没有可用的 H.264 编码器 | 系统没有 ffmpeg；Playwright 自带的 `ffmpeg-1011` 只有 vp8 | `pip install imageio-ffmpeg`（ffmpeg 7.0.2，带 libx264 / aac） | 开工时先查 `ffmpeg -encoders` |
| 2 | 中文只有文泉驿，标题没有质感 | 容器只装了 WenQuanYi | 下载 Noto Serif SC / Noto Sans SC / Inter / JetBrains Mono / Long Cang / Caveat | 开工时查 `fc-list :lang=zh` |
| 3 | 页面报 `net::ERR_CERT_AUTHORITY_INVALID`，字体没加载 | 无头 Chromium 不信任代理的 CA，直接引用 Google Fonts 失败 | 用 curl + Chrome UA 取 CSS，把 311 个 woff2 下载到本地并改写 URL | 渲染页面零外网依赖，字体一律本地化 |
| 4 | 单帧 1.3–2.1 秒 | `page.screenshot` 的 PNG 编码很慢 | CDP `Page.captureScreenshot` JPEG q95，降到 0.2–0.4 秒 | 第一次就先测“渲染 vs 截图”的耗时 |
| 5 | 伪造 AI 流失败，界面显示 “Failed to fetch”；mock 服务崩溃 | `route.continue({url})` 把同源请求改到另一个端口，浏览器按跨源处理；mock 服务在 `res` 为空时写入 | 改成 `addInitScript` 覆写 `fetch`，返回页面内的 `ReadableStream`，由 `page.evaluate(__push)` 控制节奏 | 需要逐步推进的流一律在页面内伪造 |
| 6 | 流式过程中公式出现红色报错字 | KaTeX 收到了半截 `$$…` | 按正则把 `$$…$$` 切出来整块下发，其余按 4 字一块 | 公式、表格、代码块都整块推送 |
| 7 | 界面显示“已处理 48 秒 / 39 秒” | 这是真实耗时（采集脚本很慢）；用 MutationObserver + 文本节点正则替换失败，因为文字被拆在多个节点里 | 在 done 帧截图前按元素查找 `textContent` 完全匹配的最内层元素，统一改成“已处理 6 秒” | 优先用 `page.clock` 控制时间；交付时说明这是展示值 |
| 8 | 划词后没有弹出选区菜单 | 目标文字 y=956，超出 900 的视口 | 先滚动到视口 40% 处，再用 `Range.getClientRects()` 取坐标拖选 | 所有交互前先 `scrollIntoView` 并断言坐标在视口内 |
| 9 | Bash 退出码 144，后续命令（写 `render.js`）没执行 | `pkill -f "next dev"` 匹配到了执行这条命令的 shell 自身 | 改用 `ps aux \| grep … \| grep -v grep \| awk '{print $2}' \| xargs -r kill`，并把 kill 单独放一条命令 | 不在同一条命令里用 `pkill -f` 匹配自己命令行里出现的字符串 |
| 10 | `sleep 240` 被拦截；长任务超过 10 分钟被转到后台 | 工具不允许前台长等待 | `run_in_background` + `until …; do sleep 10; done` | 渲染一律放后台，用完成通知回来 |
| 11 | 手写字体的“时”像“時”，“分”像“ク”，“？”很小 | Long Cang 的字形不适合数字和部分汉字 | 数字和计时改用 Caveat，中文单位用 Noto Serif SC；问号改成 SVG 路径手绘 | 手写字体只用于短语，数字用西文手写体 |
| 12 | 墨色字幕压在便利贴和书上，看不清 | 字幕层没有底衬 | 画面底部 300px 加纸色渐变底衬；界面上的大标题给窗口加 `brightness(0.38) blur(5px)` | 每条字幕都在最复杂的那一帧检查可读性 |
| 13 | 分屏里的界面文字小到看不清 | 840px 宽的窗口显示 1600px 的界面 | 窗内推拉放大到 2.0–2.55 倍，并对准当前焦点 | 真实界面上屏时，保证有效显示宽度不低于原始宽度的约 1.3 倍 |
| 14 | 台灯灯罩像一个浮空的蓝色方块 | 灯罩路径和灯臂末端没有接上 | 重画灯臂 (1800,760)→(1772,598)→(1702,528)，关节圆点，钟形灯罩，光锥从灯罩开口出发 | 手绘物体先画在单独预览里确认连接关系 |
| 15 | 心电线变书桌时错位 | 两个场景的 y 坐标不一致 | ECG 基线 y=750；过去场景 4.3 秒前固定相机 `s=1, cx=960, cy=560`，使书桌线 y=770 落在屏幕 750；4.3–5.0 秒再渐入手持晃动 | 形状匹配转场要先算好两边的屏幕坐标 |
| 16 | 24 秒从 DOM 切到 WebGL 时跳了一下 | 23.9 秒时标题的压暗还没结束，但 3D 平面没有压暗 | 3D 从 24.0 秒（压暗归零）开始；两边都用 `WIN_FULL` 和 1 单位 = 1 像素的相机 | 交接帧的所有滤镜、透明度必须两边一致 |
| 17 | 卡片飞向教材页时出现巨大模糊的卡片 | 281px 的卡片纹理被拉伸到 1280px | 飞行 12%–42% 时交叉淡化，教材页 mesh 继承卡片的位置、旋转和尺寸 | 尺寸跨数量级的变形，换成高分辨率素材接手 |
| 18 | 相机在两页之间穿过纸面，画面出现一大片局部 | 相机位置直线插值，路径穿过其他页面 | 页间移动加抬升弧线 `sin(πp)·(0, 520, 380)` | 3D 镜头规划时检查路径和其他物体是否相交 |
| 19 | 发光线起点在镜头前，形成一条巨大的白色条纹；线头和终点圆环过曝，盖住标签 | 起始控制点离相机太近；精灵和圆环尺寸、bloom 太大 | 起点改为从侧面远处 (-1900, 800, 100) 进入；线头 150→64，终点圆环 700→420，bloom 0.9→0.75 | HDR 发光物先在最近的镜头距离下检查 |
| 20 | 数字互相挤在一起，“万”被换行 | 列宽 360、字号 120 太大 | 列宽 340、字号 100、`white-space: nowrap`，列中心 240/600/960/1320/1680 | 数字排版按最终值（最宽情况）测量 |
| 21 | 结尾心跳线和品牌标志不在同一高度 | 线 y=560，标志中心 y=400 | 线改为 y=400，收束点就是标志中心 | 收束类动画的终点坐标直接引用目标元素 |
| 22 | 白化转场变成灰蒙蒙的一片 | 白场和暗场同时半透明叠加 | 50.0–50.72 秒白场升满，50.86 秒硬切暗场，白场 0.19 秒退掉 | 白到黑用“满白 → 硬切”，不要交叉淡化 |
| 23 | 分屏收尾时标签“现在 StudySolo”和应用自己的标题栏叠在一起 | 窗口放大时，头部标签还没淡出 | 头部标签和步骤标签提前到 21.65–21.95 秒淡出 | 布局变化开始前，先撤掉会冲突的叠加层 |
| 24 | CRF 17 初版 274.6MB | 每帧随机颗粒几乎无法压缩 | CRF 21 + `-tune film` → 84MB | 颗粒强度 ≤ 0.08；先用 5 秒片段试编码估算体积 |
| 25 | 84MB 发不出去（对话附件上限 30MiB） | 附件大小限制 | 按用户要求推到 GitHub 分支，给出页面链接和下载链接 | 开工时问清交付渠道；同时准备 < 30MiB 的两遍编码版 |
| 26 | GitHub 推送提示 GH001 大文件 | 超过 50MB 的推荐上限（硬上限 100MB） | 保留（按用户选择），并建议改用 Release 附件或 LFS | 视频优先放 Release 附件，不进 git 历史 |
| 27 | WebGL 控制台警告：软件回退已弃用、ReadPixels 导致 GPU 停顿 | 无 GPU，用 SwiftShader | `--enable-unsafe-swiftshader`，保留 `preserveDrawingBuffer` | 有 GPU 就用硬件；无 GPU 就把 3D 段放单独进程并行 |
| 28 | 169 张 3200×1800 帧全部预载会占用约 3.9GB 解码内存 | 大图序列一次性解码 | 每帧只切换当前 `src` 并 `await decode()`；蒙太奇用 1600×900 缩图 | 序列按需加载，只保留当前帧 |
| 29 | 配乐无法试听 | 环境没有音频输出 | 用 matplotlib 画 RMS 曲线 + 频谱图，按时间轴核对各段 | 交付时明确说明“未试听”，请用户确认听感 |
| 30 | 仓库 CI 的 ESLint 会扫到 `promo/` 下的 CommonJS 脚本 | 全局 lint | 在 `eslint.config.mjs` 的 `globalIgnores` 里加 `promo/**`；`.gitignore` 排除素材和中间产物 | 入库前先查仓库的 lint / knip / tsc 范围 |

另外两点必须写在交付说明里：
- **AI 回答文本是脚本化的**：界面由应用真实渲染，但回答内容是预写的，因为采集环境没有 AI 密钥。
- **“6 秒”是展示值**：右侧计时器把 17.0–21.45 秒映射成 0–6.0 秒；左侧“7 小时 47 分”是叙事设定。

---

## 四、可复用的模板

### A. 代码视频制作流程模板

```
0. 约束确认（5 分钟）
   时长 / 画幅 / fps / 声音 / 交付渠道与体积上限 / 能否运行真实应用 / 密钥情况
   环境：ffmpeg(libx264)、中文字体、nproc、磁盘、WebGL 渲染器
1. 理解产品（10 分钟）
   README、路由、内容树 → 3 个核心价值 → 1 个贯穿全片的问题 / 故事 → 在库里找证据原文
   统计真实数字（写下命令）
2. 分镜表（10 分钟）
   BPM；表头：时间 | 幕 | 情绪 | 镜头 | 字幕(中/英) | 音效事件 | 转场的“延续物”
3. 采集（20 分钟）
   pnpm dev → Playwright 1600×900@2x → 静态页
   流式 / 交互：页面内伪造 + 逐步推进 + 逐帧截图，并导出 manifest
   导出关键元素坐标（getBoundingClientRect / Range.getClientRects）
4. 素材预处理（5 分钟）
   缩图 2048 / 1600、裁切、纹理、字体本地化
5. 渲染器（30 分钟）
   core(缓动/track/随机/ev) → main(图层/字幕/fx/renderAt/ready) → 一幕一个模块
   每幕：写完 → preview 8–12 帧 → 拼图 → 修
6. 全片渲染（20 分钟，后台）
   node render.js 分段并行；同时写 audio.py 读 events.json
7. 审片（10 分钟）
   每个转场前后 5 帧拼图；每条字幕在最复杂背景下的可读性；RMS / 频谱图
   只删、只重渲受影响的帧区间
8. 导出（5 分钟）
   CRF 21 + tune film + yuv420p + faststart；需要小体积时用两遍编码
9. 交付
   ffmpeg -i 核对；按渠道上传；源码入库；说明哪些是脚本化 / 未验证
```

### B. 给 AI 的开工提示词模板

```
你要为【项目名】制作一支【时长】秒、【横屏 1920×1080 / 竖屏 1080×1920】、【60/30】fps 的宣传片，全部用代码生成，并带程序化配乐。

【项目与受众】
- 项目是：【一句话】；核心价值：【1–3 条】
- 目标观众：【人群】；看完希望他们：【行动，例如开通会员】
- 必须使用真实页面（本地运行：【启动命令、端口、需要的环境变量；没有 AI 密钥时 AI 回答可以脚本化，但需说明】）

【叙事要求】
- 先在代码库里找一个能贯穿全片的问题 / 故事，答案要跨多个模块，并能截到原文作证
- 结构参考：钩子 → 旧方法的困境 → 对比 → 核心机制的可视化（证明可信）→ 功能卡点蒙太奇 → 真实数字 → 情感回扣 + 品牌 + CTA
- 每个转场都要有一个前后延续的形状或物体；全片锁定一个 BPM，关键动作落拍

【技术要求（沿用 StudySolo 宣传片方案）】
- 渲染器是 window.renderAt(t) 的纯函数；禁止 CSS 动画 / rAF / Date.now / 未设种子的随机数
- Playwright + CDP JPEG q95 逐帧截图，按帧区间多进程并行，已存在的帧跳过
- 流式界面：addInitScript 覆写 fetch，页面内 ReadableStream 逐块推送；公式、表格整块下发；处理界面上的实时计时
- 字体全部本地化；3D 用 three.js + UnrealBloom（发光物用 >1 的 HDR 颜色）
- 声音事件在画面代码里用 ev(t, type) 登记，导出 events.json，由 Python(numpy/scipy) 合成配乐和音效
- 编码：libx264 -crf 21 -tune film -pix_fmt yuv420p -movflags +faststart；交付上限【N】MB，超过就用两遍编码

【流程与检查】
- 先交分镜表（时间 | 情绪 | 镜头 | 字幕 | 音效 | 转场延续物），再写代码
- 每幕写完渲染 8–12 帧拼图自查；全片渲染后逐个检查转场前后 5 帧
- 交付时说明：哪些内容是脚本化的、哪些没有验证（例如配乐没有试听）

【交付】
- 成片路径 / 链接，源码目录与 README，本次复盘清单
```

---

## 五、v2 迭代：全片浅色化 + 新增功能卡点（2026-09-25 14:15 起）

**需求**：① 整体背景改为浅色，包括重新采集浅色主题的真实界面；② 中段加入卡点，快速展示复习卡片、Agent 模型、主题快速切换和 Agent 工具。

**时间线变化**：功能蒙太奇从 33–44 秒延长到 33–47 秒（9 个镜头 → 11 个），数字段和结尾整体后移 3 秒，总长 57 → 60 秒（3600 帧）。

| 新镜头 | 时间 | 素材 | 实现 |
|---|---|---|---|
| 复习卡片 | 36.0–37.5 | 预置 6 张生化复习卡后截取正反面 | 影片内 CSS 3D `rotateY` 翻面，卡片区域裁切成正/反两张图贴在界面截图的同一位置 |
| 六大系列模型 | 42.0–43.5 | 模型菜单依次悬停 6 个系列 | 每 0.2 秒换一帧 + 12 个模型名芯片按八分音符弹出 |
| 21 种工具 | 43.5–45.0 | 输入框“+”菜单 + 设置 › Agent 能力 工具开关列表滚动 25 帧 | 21 个工具名芯片按十六分音符弹出 |
| 六套主题 | 45.0–46.5 | 设置 › 外观 选择器 + 8 种外观下的同一页面 | 最后 1 秒每 0.125 秒硬切一次（含深色两套），顶部黑色徽章同步显示主题名，每切一次一个木鱼音 |

**浅色化做法**
- 采集：`capture/lightinit.js` 在页面脚本运行前写入 `localStorage['gailvlun-theme']` 和 `localStorage['gailvlun-appearance-v1'] = {mode, custom}`；所有采集脚本统一 `ctx.addInitScript(lightinit(THEME, MODE))`，环境变量可切主题。
- 画面：开场改为暖白监护屏 + 深青心电线；分屏右侧、三维场景（`#eef1f6` 背景与雾）、蒙太奇、数字、结尾全部改为浅底深字；字幕新增 `dark / darkSm / heroDark` 三种样式；标题压在界面上的处理从“压暗”改成“磨砂白”（`blur + saturate` + 62% 白色蒙层）；结尾和开头的黑场改为暖白淡入淡出。
- 三维：浅色背景上加法混合和泛光会把白色页面冲成一片，因此**去掉 UnrealBloom**，发光线改为实色蓝 `#2f5bea` + 22% 透明度的宽管道（普通混合），教材页背后加一张 canvas 模糊圆角矩形作为投影，节点标签改为白底卡片。

**v2 新踩的坑**

| # | 现象 | 根本原因 | 解决 | 下次如何避免 |
|---|---|---|---|---|
| 31 | 复习卡片页面显示“还没有记忆卡” | 数据在 IndexedDB（`gailvlun-db` / `keyval` / `review-cards`），而每个 Playwright context 的存储都是全新的 | 在同一个 context 里先打开站点，用 `indexedDB.open` 写入 `JSON.stringify({state:{byId,order},version:0})`，再进入复习页 | 预置数据和截图必须在同一个 context；先读 store 的 `persist name`、`partialize` 和 `version` |
| 32 | 用 CDP `Animation.setPlaybackRate(0.12)` 想放慢翻卡动画，结果 2 帧就翻完 | framer-motion 由 JS 驱动（rAF），不受 CSS / WAAPI 播放速率影响 | 只截正面和背面，在影片里自己做 3D 翻转（时间完全可控、可卡点） | 采集不到的中间态就“截端点、自己补动画” |
| 33 | 开场到手绘段的过渡出现上下两条深色带 | 开场背景淡出时露出了舞台底色 `#06070b` | 舞台底色改为 `#f6f4ef` | 换主色调时连同 `#stage`、`body` 底色一起改 |
| 34 | 三维段白色教材页发虚、发光线变成白雾 | 浅色背景上 bloom 阈值被页面白色触发；加法混合在白底上只会更白 | 移除 bloom，全部改普通混合 + 实色 | 浅色场景用“实色 + 投影”表现层次，不用发光 |
| 35 | 划词镜头可能读到不存在的帧 | 浅色重采后 studio 序列从 198 帧变成 164 帧，而镜头按固定帧号取图 | 取帧加 `Math.min(163, …)` 上限 | 序列帧号一律按 manifest 长度夹紧 |
| 36 | 音频淡出点可能错到几千秒之后 | 新增的时间偏移常量叫 `L`，与混音侧链循环里的 `L = int(0.32*SR)` 重名，后者覆盖了前者 | 改名为 `LS` | Python 合成脚本里的全局常量用有意义的长名字 |
| 37 | 后半段所有时间点都要 +3 秒 | 数字段、结尾、音效事件、字幕、FX 分散在多个文件 | `core.js` 导出 `LATE = 3`：main 给 stats / finale 传 `t - LATE`，它们的 `ev()` 与字幕时间 `+ LATE`，audio.py 用 `LS` | 从一开始就按“段落本地时间 + 段落起点”写，插入新段只改一个常量 |
| 38 | 3 个渲染进程之一在 44.57 秒崩溃（`undefined is not iterable`），其余进程照常跑完，差点漏掉 | 21 个工具芯片的随机落位在间距约束下只凑出不到 21 个槽位，`const [x, y] = c.xy` 取到 undefined | 放宽间距、增加右下角区域，并在尝试上限后按网格补齐槽位；从 42 秒起重渲 1080 帧 | 随机布局函数必须保证返回数量；渲染完先 `ls frames \| wc -l` 核对帧数，并检查每个进程日志末尾是 `done` |

**v2 成片**：60.00 秒、3600 帧、CRF 21 + `-tune film`，**59.95MB（7.99 Mbps）**——比 v1 的 84MB 小约 30%：浅色大面积平涂更好压缩，颗粒透明度也从 0.075 降到 0.055。

**v2 耗时**：探索与采集约 35 分钟（含等待 Next 首次编译 2.7 分钟）、改代码与预览约 25 分钟、全片渲染约 22 分钟。
