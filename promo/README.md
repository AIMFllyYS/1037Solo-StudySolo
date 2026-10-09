# StudySolo 宣传片 · 生成器

60 秒 · 1920×1080 · 60fps 的浅色品牌宣传片，全部由代码生成：真实页面采集 → 逐帧确定性渲染（SVG 手绘 + three.js + DOM 动效）→ 程序化配乐与音效。

成片：[`studysolo-promo.mp4`](studysolo-promo.mp4)（60MB，v2 浅色版）。其余中间产物不入库，按下方步骤可完整复现。

## 叙事结构

一个问题贯穿全片：**「为什么糖尿病人的呼吸，会有烂苹果味？」**——答案横跨组胚、生化、系解三本教材。

| 时间 | 幕 | 画面 |
|---|---|---|
| 0–4s | 开场 | 心电线在浅色监护屏上跳动，问题浮现；心电基线变成书桌边缘 |
| 4–15s | 过去 | 手绘书桌：翻页加速、书越堆越高、便利贴与红色问号、钟表飞转、夕阳落山、台灯亮起 |
| 15–24s | 过去 \| 现在 | 分屏对比：左侧仍在翻书（7 小时+），右侧真实 Agent 界面（浅色主题）6 秒跨三本教材作答并给出 4 条出处 |
| 24–33s | 那根线 | 4 张来源卡片飞出界面、展开成真实教材页，一条发光的线在三维空间里把因果链逐节点串起 |
| 33–47s | 功能 | 11 个卡点镜头：划词提问、全局搜索、复习卡片翻面、题目测试、可交互、课堂原文、详解、六大系列模型、21 种 Agent 工具、六套主题快切（含深色）、书架 |
| 47–50s | 数字 | 13 门学科 · 1,187 章节 · 5,454 道题 · 339 段动画 · 3,590 万字（均取自仓库真实统计） |
| 50–60s | 结尾 | 同一张书桌，今天太阳还没落山；心跳线收束成品牌标志、口号与开通会员 CTA |

## 复现

需要 Node 22+、Python 3.11（numpy、scipy、pillow、imageio-ffmpeg）。所有命令在 `promo/` 下执行。

```bash
npm install                                   # playwright + three
ln -sfn ../node_modules/three film/three

# 1. 采集真实页面（先在仓库根目录 pnpm dev，端口 35349）
node capture/shot2.js '[["home","/"],["bio-detail","/biochemistry/detail/1.1"],["prob-41","/probability/detail/4.1",6000],["bio-lec","/biochemistry/recording/rec-rec-2026-fall-001-002"],["anat-detail","/anatomy/detail/1.1"]]'
node capture/cap_pages.js      # 四页来源教材 + 划词
node capture/cap_misc.js       # 全局搜索
node capture/cap_more.js       # 书架悬停、插件市场
node capture/cap_inter.js      # 方差可交互组件逐帧
node capture/cap_quiz.js && node capture/cap_quiz2.js
node capture/cap_agent.js agent    # Agent 流式回答逐帧（脚本化 UI 消息流，界面为真实渲染）
node capture/cap_agent.js studio   # 划词 → 解释 → 右侧面板作答
node capture/cap_new.js            # 复习卡片（预置 IndexedDB）、模型菜单、工具面板、主题切换
# 采集默认浅色主题；THEME=dark 或 MODE=anthropic 等环境变量可切换（见 capture/lightinit.js）

# 2. 素材：缩图、来源卡裁切、纸张纹理、本地字体
python3 make_assets.py

# 3. 渲染（静态服务 film/，逐帧截图；可并行分段）
(cd film && python3 -m http.server 8765 &)
node render.js 0 1200 frames & node render.js 1200 2400 frames & node render.js 2400 3600 frames
python3 audio.py               # 读取 events.json，合成 score.wav

# 4. 合成
ffmpeg -framerate 60 -i frames/%05d.jpg -i score.wav -c:v libx264 -preset slow -crf 20 \
  -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart studysolo-promo.mp4
```

`node preview.js 12.5,30.4 prev` 可渲染任意时刻的单帧用于审片。

## 实现要点

- **确定性渲染**：`window.renderAt(t, frame)` 是时间的纯函数，任意帧可独立重渲、分段并行。
- **真实界面**：Agent 回答通过页面内 `fetch` 覆写喂入 AI SDK UI 消息流，逐块推进并逐帧截图；侧栏、来源面板、引用角标、KaTeX 公式均由应用本身渲染。
- **手绘**：粗糙线条生成 + `feTurbulence` 位移滤镜每 5 帧换种子，形成手绘动画的“沸腾线”质感。
- **三维**：three.js + UnrealBloom；来源卡片与教材页在同一相机下衔接，节点标签按投影坐标叠加。
- **声音**：`audio.py` 读取画面导出的事件表（翻页、落书、键入、节点点亮、转场），与 120 BPM 配乐同步合成。
