# 期末复习工作站 · 多学科辅助学习应用

> **范围：** 这是 StudySolo（仓库现名 `1037Solo-StudySolo`，旧名 Notebook-MedFreshman），域名 `studysolo.1037solo.com`，跑在另一台机器上，不在 MainECS 的 `/1037Solo` 部署里。它和 StudyFlow 不是同一个产品。

# 鏈熸湯澶嶄範宸ヤ綔绔?路 澶氬绉戣緟鍔╁涔犲簲鐢?
> **褰撳墠鏃犱汉鍊煎畧涓婁笅鏂囦笌杩斿伐浜ゆ帴锛?* [docs/handoff/README.md](docs/handoff/README.md)銆傜敤鎴峰凡鎺堟潈鎭㈠鎵ц锛涗换鍔℃寜6椤瑰ぇ鏉垮潡鍧囩敱GPT-6.1 Sol High瀛愭櫤鑳戒綋鎵ц锛屼富鏅鸿兘浣撶粺绛逛笌楠屾敹缁勭粐锛屾棫鎶€鏈獙鏀朵笉浠ｈ〃鐢ㄦ埛鍙敤銆?
<div align="center">

**鐢辫鍫傚綍闊抽€愬瓧绋块┍鍔ㄧ殑娣卞害瀛︿範鍔╂墜**

鍙几缂╁鑸?+ 璇﹀敖鍘熷垱绗旇锛堝畬缇庡叕寮忥級+ 鍙充晶涓夋澘鍧楋紙AI 瀵硅瘽 / Manim 鍔ㄧ敾 / 鍙氦浜掑唴瀹癸級+ 鍒掕瘝闂?AI

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

[蹇€熷紑濮媇(#蹇€熷紑濮? 鈥?[鍔熻兘鐗规€(#鍔熻兘鐗规€? 鈥?[椤圭洰鏋舵瀯](#椤圭洰鏋舵瀯) 鈥?[寮€鍙戞寚鍗梋(#寮€鍙戞寚鍗? 鈥?[璐＄尞鎸囧崡](#璐＄尞鎸囧崡)

</div>

## 蹇€熷紑濮?
```bash
pnpm install
cp .env.example .env.local   # 濉叆浣犵殑 AI 绔偣
pnpm dev                     # http://localhost:35349
```

### 閰嶇疆 AI锛堣嚜瀹氫箟 OpenAI 鍏煎绔偣锛?
缂栬緫 `.env.local`锛?
```
RELAY_BASE_URL=https://relay.protocom.org/v1
RELAY_API_KEY=sk-xxx
AI_MODEL_FLASH=z-ai/glm-5.3-flash
AI_MODEL_PRO=Qwen/Qwen3.8-27B
AI_BASE_URL=https://api.siliconflow.cn/v1   # 鐢熷浘 + 鍚戦噺
AI_API_KEY=sk-xxx
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MIMO_API_KEY=tp-xxx
UNSPLASH_ACCESS_KEY=锛堝彲閫夛級鍦?unsplash.com/oauth/applications 鐢宠锛屽惎鐢?AI 鍥剧墖鎼滅储
```

鏈厤缃椂锛屾鏋跺叾浣欓儴鍒嗭紙绗旇銆佸姩鐢诲皬绐椼€佷氦浜掋€佸垝璇嶏級鐓у父鍙敤锛孉I 瀵硅瘽浼氱粰鍑?鏈厤缃?鎻愮ず銆?
### 妫€绱㈢储寮曞垎鍙?
`searchNotes` 鍙鏈湴 `content/.index/`锛堜笉闅?git 鍏ュ簱锛夈€傚紑鍙戞満鎵ц `pnpm build-index` 鐢熸垚锛涢儴缃叉椂鎶婅鐩綍浣滀负浜х墿鍚屾鍒版湇鍔″櫒鍚岃矾寰勶紝閲嶅惎 Node 杩涚▼鍚?`GET /api/health/search` 搴旇繑鍥?`ok: true`銆傝瑙?`docs/sop/10-search-index-lifecycle.md` 涓?`docs/plans/archive/15-search-index-distribution-and-rag-quality.md`銆?
## 娓叉煋鍔ㄧ敾锛圡anim锛?
闇€瑕?Python + Manim + ffmpeg锛涘叕寮忔覆鏌撻渶 LaTeX锛圡iKTeX锛夈€?
```bash
pnpm render                  # 娓叉煋鍏ㄩ儴灏氭湭鐢熸垚鐨勮棰?pnpm render:chapter ch01     # 浠呮覆鏌撶涓€绔?python manim/render.py --force --quality h   # 寮哄埗楂樼敾璐ㄩ噸娓?```

浜х墿杈撳嚭鍒?`public/media/videos/<ch>/<id>.mp4`锛屽苟鑷姩鍐欏叆 `lib/content-data/media.generated.ts`銆?
## 鍔熻兘鐗规€?
### 馃幆 澶氬绉戞敮鎸?- **姒傜巼璁轰笌鏁扮悊缁熻** - 瀹屾暣鐨勭珷鑺傝瑙ｃ€佸姩鐢绘紨绀恒€佷氦浜掔粍浠躲€佽€冪爺褰曢煶棰樺簱涓庡疄鎴樻紨缁冪湡棰樻ā鎷熷嵎
- **澶у鐗╃悊** - 绗竴绔犺瑙ｃ€佷緥棰樸€侀搴撱€佽€冨墠妯℃嫙鐪熼涓?27 濂楀綍闊充緥棰?- **鏈夋満鍖栧** - 鍒嗗瓙缁撴瀯銆佸弽搴旀満鐞嗙殑娣卞害瑙ｆ瀽
- **涓浗杩戠幇浠ｅ彶绾茶** - 鏁欐潗鍐呭銆? 濂楄€冨墠妯℃嫙鍗蜂笌鏁欐潗棰樺簱锛坱b-ch00鈥?0锛?- **姣涙辰涓滄€濇兂鍜屼腑鍥界壒鑹茬ぞ浼氫富涔夌悊璁轰綋绯绘璁?* - 2023 鐗堟暀鏉愭媶绔犱负鑺傘€佹暀鏉愰搴?tb-ch00鈥?8銆佸綍闊抽搴撹€冪爺閲嶅啓銆佽€冨墠妯℃嫙鎶奸鍗?- **澶у鑻辫锛圕ET-4锛?* - Unit 1鈥? 鍏ㄥ鍐呭锛屽惈鍘熸枃绮捐銆佷緥棰樼簿璁蹭笌闅忓爞娴嬮獙
- **鍙墿灞曟灦鏋?* - 杞绘澗鎺ュ叆鏂板绉戯紙璇﹁ `docs/sop/subject-onboarding.md`锛?
### 馃摎 鏅鸿兘瀛︿範浣撻獙
- **璇﹀敖鍘熷垱绗旇** - 鍩轰簬璇惧爞褰曢煶鐨勬繁搴﹁В鏋愶紝瀹岀編鏁板鍏紡娓叉煋锛圞aTeX锛?- **AI 瀵硅瘽鍔╂墜** - 涓婁笅鏂囨劅鐭ョ殑鏅鸿兘闂瓟锛屾敮鎸佸垝璇嶆彁闂€佸浘鐗囬檮浠躲€佽仈缃戞悳绱?- **Agent 鎵ц鏃堕棿杞?* - reasoning銆佸伐鍏蜂笌涓棿璇存槑鎸夋秷鎭?parts 鐨勬椂搴忓睍绀猴紝杩愯鏃跺睍寮€銆佺粨鏉熸椂鏀舵嫝锛屾渶缁堝洖绛斾笌寮曠敤/浜х墿鍗＄墖鐙珛淇濈暀锛涘仠姝㈢敓鎴愬悗鍙户缁煡鐪嬪凡鎺ユ敹鍐呭
- **鑸掗€傜殑鑱婂ぉ甯冨眬** - 閫忔槑鎮诞杈撳叆鍖猴紝涓婄疆鎬濊€?鎼滅储/涓婁笅鏂?妯″瀷鎺т欢锛涚敤鎴锋秷鎭潬鍙炽€丄I 闈犲乏锛屾墽琛岃繃绋嬪垎灞傜缉杩涳紱妗岄潰銆佹墜鏈哄拰鍒掕瘝娴獥鍏变韩鑷粯鍥炬爣涓庡姩鎬佹粴鍔ㄩ伩璁?- **澶?Provider 閫傞厤鍣?* - 鍐呯疆 OpenAI 鍏煎 / Anthropic 閫傞厤鍣紝鎬濊€冩。浣嶏紙ThinkingMenu锛夊彲鍏ㄥ眬涓庨€愪細璇濊皟鑺?- **AI 鍥剧墖鎼滅储** - 闆嗘垚 Unsplash API锛孉I 瀵硅瘽鍙悳绱㈠苟鎻掑叆楂樿川閲忛厤鍥撅紙閰嶇疆 `UNSPLASH_ACCESS_KEY` 鍚敤锛?- **AI 鍥剧墖鐢熸垚** - 澶嶇敤 OpenAI 鍏煎绔偣鐢熸垚鍥剧墖锛岀嫭绔嬫煡鐪嬪櫒銆佷細璇濇寔涔呭寲銆佺敾寤婃眹鎬伙紝涓庡璇濆伐鍏烽摼鎵撻€?- **鑷畾涔?API 涓庡妯″瀷鍒囨崲** - 鍦ㄨ缃腑娣诲姞浠绘剰 OpenAI 鍏煎绔偣锛屾敮鎸佸 API 鍒嗙粍涓庨€愮粍瀹氫环锛屼笌鍐呯疆妯″瀷缁熶竴绠＄悊
- **Token 涓庤璐圭湅鏉?* - 姣忎釜娴獥鐙珛鏄剧ず涓婁笅鏂?Token 鐢ㄩ噺锛汢illingDashboard 姹囨€?token 涓庡浘鐗囩敓鎴愯垂鐢紝鍚?3D 缈诲崱鐗囨憳瑕佷笌瓒嬪娍鍥捐〃
- **缁熶竴鐢诲竷杩愯鏃?* - 鍑芥暟鍥俱€丼VG銆丠TML 鍥捐〃銆佸寲瀛﹀紡缁熶竴璧?typed canvas block runtime锛屾敮鎸?AI 淇涓庤〃杈惧紡璇婃柇
- **Manim 鍔ㄧ敾璁茶В** - Python 椹卞姩鐨勬暟瀛﹀姩鐢伙紝鐩磋灞曠ず鎶借薄姒傚康
- **鍙氦浜掔粍浠?* - 鍔ㄦ€佸彲瑙嗗寲宸ュ叿锛屾敮鎸佸弬鏁拌皟鑺傚拰瀹炴椂鍙嶉
- **涓夋澘鍧楀竷灞€** - AI 瀵硅瘽 / 鍔ㄧ敾璁茶В / 鍙氦浜掑唴瀹规棤缂濆垏鎹?- **绛旈浼氳瘽鎸佷箙鍖?* - 娴嬮獙杩涘害鍐欏叆 IndexedDB锛岄€€鍑哄悗鑷姩鎭㈠鐜板満
- **闆嗕腑鍖栧揩鎹烽敭绯荤粺** - 鍏ㄥ眬蹇嵎閿泦涓敞鍐岋紝鏀寔閫愰」鍚仠

### 馃摬 瀹夎涓哄簲鐢紙PWA锛?- **妗岄潰绔浐瀹氬埌浠诲姟鏍?* - Edge / Chrome 鎵撳紑绔欑偣 鈫?鍦板潃鏍忓畨瑁呭浘鏍囨垨鑿滃崟銆屽畨瑁呮绔欑偣涓哄簲鐢ㄣ€嶏紝鍗冲彲鍍忓師鐢熻蒋浠朵竴鏍风嫭绔嬬獥鍙ｈ繍琛岋紝鍙抽敭鍥哄畾鍒颁换鍔℃爮涓€閿寮€
- **鎵嬫満绔浐瀹氬埌涓诲睆骞?* - iPhone锛圫afari 鍒嗕韩 鈫?娣诲姞鍒颁富灞忓箷锛? Android锛圕hrome 鑿滃崟 鈫?瀹夎搴旂敤锛夛紝鍚姩鏃跺叏灞忔棤娴忚鍣ㄥ湴鍧€鏍?- **闆跺畨瑁呭寘** - 鏃犻渶搴旂敤鍟嗗簵涓嬭浇锛岄€氳繃娴忚鍣ㄥ嵆鍙畨瑁咃紝涓嶅崰鐢ㄩ澶栧瓨鍌?
### 馃帹 澶栬涓€у寲
- **瀛椾綋涓庤璺濊皟鑺?* - 璁剧疆闈㈡澘鍙疄鏃惰皟鑺傚瓧浣撳ぇ灏忓拰琛岄棿璺濓紝閫傚簲涓嶅悓闃呰鍋忓ソ
- **涓婚閰嶈壊** - 鍐呯疆澶氬閰嶈壊鏂规锛孋SS 灞傞┍鍔ㄥ疄鏃跺垏鎹紝璁剧疆鎸佷箙鍖?
### 馃洜 鎶€鏈寒鐐?- **缁熶竴绐楀彛绠＄悊** - 娴獥銆丄rtifact Viewer銆佸叏灞忕獥鍙ｇ敱缁熶竴妗嗘灦绠＄悊锛屽叏灞€浠诲姟鏍忎竴閿彫鍥?- **鑷畾涔?API 澶氭ā鍨嬩笌澶氬垎缁?* - 杩愯鏃舵坊鍔犱换鎰?OpenAI 鍏煎绔偣涓庢ā鍨嬶紝鎸?API 鍒嗙粍闅旂锛屼笌鍐呯疆妯″瀷缁熶竴璋冨害
- **Storage v2 鎬ц兘鏋舵瀯** - 瀵硅瘽鍘嗗彶鎸変細璇濇媶鍒嗗啓鍏?IndexedDB锛孋hatThread 铏氭嫙鍖栥€佽闃呴殧绂讳笌渚嬮鎳掑姞杞藉叡鍚屼繚璇侀暱浼氳瘽娴佺晠
- **澶氬绉戝唴瀹规爲** - 缁熶竴鐨勫唴瀹圭鐞嗙郴缁燂紝鏀寔鏁欐潗銆佽瑙ｃ€佸綍闊炽€佺邯瑕佸垎绫?- **鑷畾涔?Markdown 鎸囦护** - `::video`銆乣::interactive`銆乣:::definition` 绛夊瘜鏂囨湰鎵╁睍
- **鍙鍖栧師璇簱** - 缁存仼鍥俱€佸垎甯冨浘銆佸叕寮忔楠ょ瓑鍙鐢ㄧ粍浠?- **灏忕獥鎾斁妯″紡** - 瑙嗛鐢讳腑鐢诲姛鑳斤紝鏀寔璺ㄩ〉闈㈢画鎾?- **鍝嶅簲寮忚璁?* - 鍩轰簬 Tailwind v4 鐨勭幇浠ｅ寲 UI
- **PWA 鍙畨瑁?* - Web App Manifest + appleWebApp锛屾敮鎸佸畨瑁呬负妗岄潰/绉诲姩绔嫭绔嬪簲鐢?
## 閲忎骇绔犺妭鍐呭

鍙傝 **`docs/sop/02-detail-generation.md`**銆傛寚瀹氱珷鑺傚嵆鍙粡 Workflow 鎵囧嚭瀛愭櫤鑳戒綋锛?涓烘瘡涓皬鑺備骇鍑恒€岃灏界瑪璁?+ 鍔ㄧ敾 + 浜や簰銆嶄笁浠跺銆傚畬鏁?SOP 浣撶郴瑙?`docs/sop/README.md`銆?
## 鐩綍缁撴瀯

```
app/                 # Next App Router锛堥〉闈?+ /api 璺敱锛?components/           # 甯冨眬 / 绗旇娓叉煋 / 瀵硅瘽 / 瑙嗛 / 浜や簰
lib/                 # store銆佸唴瀹规敞鍐岃〃銆佸唴瀹瑰姞杞藉櫒銆丄I 宸ュ叿
content/             # 鍚勫皬鑺?.md 绗旇涓庡唴瀹硅祫婧?manim/               # Manim 鍦烘櫙涓庢覆鏌撹剼鏈?docs/                # 閫愬瓧绋裤€佺邯瑕併€丼OP銆佽璁℃枃妗?scripts/             # 鍐呭鎻愬彇銆佹捣鎶ョ敓鎴愩€佸伐浣滄祦鑴氭湰
public/              # 闈欐€佽祫婧愶紙瑙嗛銆佸浘鐗囥€佹捣鎶ャ€丳WA 鍥炬爣锛?```

## 椤圭洰鏋舵瀯

### 鏍稿績璁捐鐞嗗康
- **澶氬绉戠粺涓€鏋舵瀯** - 閫氳繃 `SubjectId` 鍜?`CategoryId` 瀹炵幇瀛︾鏃犲叧鐨勫唴瀹圭鐞?- **缁勪欢娉ㄥ唽绯荤粺** - 浜や簰缁勪欢閫氳繃 `registry.ts` 缁熶竴绠＄悊锛屾敮鎸佹噿鍔犺浇
- **濯掍綋娓呭崟椹卞姩** - 瑙嗛璧勬簮閫氳繃 `media.generated.ts` 闆嗕腑绠＄悊
- **瀵屾枃鏈墿灞?* - 鑷畾涔?Markdown 鎸囦护瀹炵幇澶氬獟浣撳唴瀹瑰祵鍏?- **鍏变韩娓叉煋鏋舵瀯** - 绗旇涓?AI 瀵硅瘽澶嶇敤鍚屼竴 Markdown 娓叉煋鏍稿績锛岃瑙?`docs/refer/rendering-architecture.md`
- **鐘舵€佺鐞?* - Zustand 鍏ㄥ眬鐘舵€佺鐞嗗鑸€佹挱鏀俱€佸璇濈瓑璺ㄧ粍浠剁姸鎬侊紱瀵硅瘽鍘嗗彶涓庝氦浜掓紨绀轰骇鐗╂寔涔呭寲鑷?IndexedDB锛岃缃?涓婚绛夊皬鏁版嵁淇濈暀 localStorage锛堣瑙?`docs/refer/storage-architecture.md`锛?
### 鍏抽敭鎶€鏈粍浠?- **鍐呭鏍?* - `lib/content-data/manifest.ts` 瀹氫箟澶氬绉戝唴瀹圭粨鏋?- **璺敱绯荤粺** - 鍔ㄦ€佽矾鐢?`/[subject]/[category]/[id]` 鏀寔澶氬绉戣闂?- **AI 闆嗘垚** - AI SDK 7 `ToolLoopAgent` + UIMessage Stream锛涗繚鐣欏師 provider/妯″瀷娉ㄥ唽琛紝鍏煎 OpenAI-compatible 涓?Anthropic锛屽墠绔?transport/stream 鍙礋璐ｄ紶杈擄紝Zustand + IndexedDB 缁х画璐熻矗鍘嗗彶涓庢寔涔呭寲銆傝縼绉昏竟鐣屽強楠屾敹瑙?[Agent SDK / Trace UI 璁板綍](docs/plans/archive/13-agent-sdk-trace-ui.md)
- **鍙鍖栧紩鎿?* - 鍩轰簬 Manim 鐨勬暟瀛﹀姩鐢?+ React 鍙氦浜掔粍浠?- **鍏紡娓叉煋** - KaTeX 瀹炵幇瀹岀編鐨勬暟瀛﹀叕寮忔樉绀?
## 寮€鍙戞寚鍗?
### 鐜瑕佹眰
- Node.js 22+锛堟湰娆¤縼绉诲湪 Node 24 涓婇獙璇侊級
- pnpm 8+
- Python 3.8+锛堢敤浜?Manim 鍔ㄧ敾娓叉煋锛?- LaTeX/MiKTeX锛堢敤浜庢暟瀛﹀叕寮忔覆鏌擄級

### 鏈湴寮€鍙?
```bash
# 瀹夎渚濊禆
pnpm install

# 閰嶇疆鐜鍙橀噺
cp .env.example .env.local
# 缂栬緫 .env.local锛屽～鍏ヤ綘鐨?AI 绔偣閰嶇疆

# 鍚姩寮€鍙戞湇鍔″櫒
pnpm dev
# 璁块棶 http://localhost:35349
```

### 娓叉煋鍔ㄧ敾

```bash
# 娓叉煋鎵€鏈夋湭鐢熸垚鐨勮棰?pnpm render

# 娓叉煋鎸囧畾绔犺妭
pnpm render:chapter ch01

# 寮哄埗楂樼敾璐ㄩ噸娓叉煋
python manim/render.py --force --quality h
```

### 浠ｇ爜瑙勮寖

```bash
# 杩愯 ESLint 妫€鏌?pnpm lint

# 鑷姩淇闂
pnpm lint:fix

# 绫诲瀷妫€鏌?pnpm exec tsc --noEmit

# 娉ㄥ唽琛ㄣ€乵anifest 涓庡唴瀹规枃浠朵竴鑷存€ф鏌?pnpm check:registry
```

### 鎺ュ叆鏂板绉?
璇︾粏姝ラ璇峰弬鑰?[`docs/sop/subject-onboarding.md`](docs/sop/subject-onboarding.md)锛?
1. 鍦?`lib/content-data/subjects.registry.ts` 娉ㄥ唽瀛︾鍏冩暟鎹?2. 鐢ㄦ暀鏉愭彁鍙?瀵煎叆鑴氭湰鐢熸垚 `lib/content-data/{subject}-textbook.ts`
3. 鍦?`lib/content-data/manifest.ts` 鎸傝浇 `contentTree` 涓庢暀鏉愭潯鐩?4. 鎸夌害瀹氭斁缃?`content/{subject}/{category}/` 姝ｆ枃锛屽彲閫夋坊鍔犲绉戞彁绀鸿瘝
5. 杩愯 `pnpm check:registry`銆乣pnpm exec tsc --noEmit` 骞惰闂涓矾鐢遍獙璇?
## 鎶€鏈爤

### 鍓嶇
- **Next.js 16** - React 妗嗘灦锛孉pp Router
- **React 19** - UI 搴?- **TypeScript 5.7** - 绫诲瀷瀹夊叏
- **Tailwind CSS 4.0** - 鏍峰紡妗嗘灦
- **Zustand** - 鐘舵€佺鐞?
### 鍐呭涓庢暟瀛?- **react-markdown** - Markdown 娓叉煋
- **KaTeX** - 鏁板鍏紡娓叉煋
- **remark-math** - Markdown 鏁板璇硶鏀寔
- **rehype-katex** - KaTeX 闆嗘垚

### UI 缁勪欢
- **lucide-react** - 鍥炬爣搴?- **framer-motion** - 鍔ㄧ敾搴?- **react-resizable-panels** - 鍙皟鏁村ぇ灏忛潰鏉?- **@vidstack/react** - 瑙嗛鎾斁鍣?
### 鍔ㄧ敾涓庡悗绔?- **Manim** - Python 鏁板鍔ㄧ敾寮曟搸
- **ffmpeg** - 瑙嗛澶勭悊

## 璐＄尞鎸囧崡

鎴戜滑娆㈣繋鍚勭褰㈠紡鐨勮础鐚紒

### 濡備綍璐＄尞

1. Fork 鏈粨搴?2. 鍒涘缓浣犵殑鐗规€у垎鏀?(`git checkout -b feature/AmazingFeature`)
3. 鎻愪氦浣犵殑鏇存敼 (`git commit -m 'Add some AmazingFeature'`)
4. 鎺ㄩ€佸埌鍒嗘敮 (`git push origin feature/AmazingFeature`)
5. 寮€鍚竴涓?Pull Request

### 璐＄尞绫诲瀷
- 馃悰 淇 Bug
- 鉁?鏂板鍔熻兘
- 馃摑 鏀硅繘鏂囨。
- 馃帹 浼樺寲 UI/UX
- 鈿?鎬ц兘浼樺寲
- 馃И 娣诲姞娴嬭瘯

### 浠ｇ爜瀹℃煡
鎵€鏈?Pull Request 闇€瑕侀€氳繃浠ｇ爜瀹℃煡锛岀‘淇濓細
- 浠ｇ爜绗﹀悎椤圭洰瑙勮寖
- 閫氳繃 ESLint 妫€鏌?- TypeScript 绫诲瀷妫€鏌ラ€氳繃
- 蹇呰鏃舵坊鍔犳祴璇曠敤渚?
## 甯歌闂

### AI 瀵硅瘽鏄剧ず"鏈厤缃?
纭繚 `.env.local` 鏂囦欢涓纭厤缃簡 AI 绔偣锛?```
AI_BASE_URL=https://浣犵殑绔偣/v1
AI_API_KEY=sk-xxx
AI_MODEL_PRO=浣犵殑妯″瀷id
```

### 鏁板鍏紡娓叉煋寮傚父
妫€鏌ユ槸鍚︽纭畨瑁呬簡 KaTeX 渚濊禆锛岀‘淇濆叕寮忚娉曠鍚?KaTeX 瑙勮寖銆?娉ㄦ剰锛歚$$` 蹇呴』鐙崰涓€琛岋紝鍚﹀垯浼氬鑷存覆鏌撳穿婧冦€?
### 瑙嗛鏃犳硶鎾斁
纭瑙嗛鏂囦欢瀛樺湪浜?`public/media/videos/` 瀵瑰簲鐩綍锛屼笖 `lib/content-data/media.generated.ts` 涓湁鏉＄洰璁板綍銆?
### Manim 娓叉煋澶辫触
纭繚 Python 鐜閰嶇疆姝ｇ‘锛屽凡瀹夎 Manim 鍜?ffmpeg銆侺aTeX/MiKTeX 鐢ㄤ簬鍏紡娓叉煋銆?
## 璺嚎鍥?
- [x] 澶у鑻辫缁冧範鏉垮潡锛圲nit 1鈥?锛?- [x] 绛旈杩涘害鎸佷箙鍖?- [x] 鑷畾涔?API 澶氭ā鍨嬬鐞?- [x] 鍏ㄥ眬澶栬瀹氬埗锛堝瓧浣?/ 琛岃窛 / 涓婚锛?- [x] 澶у鐗╃悊绗竴绔犲唴瀹癸紙璇﹁В / 渚嬮 / 棰樺簱 / 褰曢煶渚嬮 / 鑰冨墠妯℃嫙锛?- [x] AI 鍥剧墖鐢熸垚涓庤璐逛华琛ㄧ洏
- [x] 瀵硅瘽瀛樺偍 Storage v2 涓?ChatThread 铏氭嫙鍖?- [x] 妗岄潰绔紙Electron锛塿0.4.0 瀹夎鍖呭彂甯?- [x] 澶т簩涓婂鏈熷骞村垏鎹笌浜旀湰鏁欐潗锛堢粏鑳炵敓鐗╁ / 缁勮儦 / 鐢熷寲 / 绯荤粺瑙ｅ墫 / 浠櫒鍒嗘瀽锛?- [x] 妗岄潰绔紙Electron锛塿0.5.0 瀹夎鍖呭彂甯?- [ ] 鏀寔鏇村瀛︾锛堢嚎鎬т唬鏁扮瓑锛?- [ ] 澧炲己 AI 瀵硅瘽鑳藉姏锛堢煡璇嗗浘璋便€佸杞繁搴︽帹鐞嗭級
- [ ] 浼樺寲绉诲姩绔綋楠?- [ ] 鏀寔鐢ㄦ埛鑷畾涔夌瑪璁?- [ ] 闆嗘垚鏇村鍙鍖栫粍浠?- [ ] 娣诲姞鍗曞厓娴嬭瘯鍜岄泦鎴愭祴璇?
## 璁稿彲璇?
鏈」鐩鏄庨噰鐢?MIT 璁稿彲璇侊紱浠撳簱鏍圭洰褰曠殑璁稿彲璇佸師鏂囨枃浠跺皻缂猴紝寰呯淮鎶よ€呰ˉ榻愩€?
## 鑷磋阿

- 鎰熻阿鎵€鏈夎础鐚€呯殑鏀寔
- 鎰熻阿寮€婧愮ぞ鍖烘彁渚涚殑浼樼宸ュ叿鍜屽簱
- 鐗瑰埆鎰熻阿璇惧爞褰曢煶鍐呭鎻愪緵鑰?
---

<div align="center">

**濡傛灉杩欎釜椤圭洰瀵逛綘鏈夊府鍔╋紝璇风粰涓?猸愶笍 Star 鏀寔涓€涓嬶紒**

Made with 鉂わ笍 for learners everywhere

</div>

