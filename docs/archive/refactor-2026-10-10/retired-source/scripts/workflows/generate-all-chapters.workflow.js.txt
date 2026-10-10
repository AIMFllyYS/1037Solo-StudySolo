export const meta = {
  name: "generate-all-chapters",
  description: "ch02-ch08全部7章29节并行生成三件套（详尽笔记+交互组件+Manim动画）并集成进应用",
  phases: [
    { title: "笔记", detail: "29节极详尽原创笔记并行撰写" },
    { title: "交互与动画", detail: "29个交互组件+29个Manim场景并行生成" },
    { title: "集成", detail: "更新manifest.ts、registry.ts并渲染全部动画" },
  ],
};

const ROOT = "D:/new_project/Gailvlun";

// ─── 全章节小节配置 ────────────────────────────────────────────────────────
const CHAPTERS = [
  {
    id: "ch02",
    title: "随机变量及其分布",
    summary: "随机变量概念；离散型分布与分布律；分布函数；连续型分布与概率密度；常见分布族；随机变量函数的分布。",
    transcripts: ["概率论-第7节.txt", "概率论-第8节.txt", "概率论-第九节.txt"],
    sections: [
      {
        id: "2.1",
        title: "随机变量的概念",
        summary: "随机变量的直觉与定义（样本空间到实数轴的映射）；离散与连续随机变量的区分；为什么需要引入随机变量。",
        videoId: "ch02-2.1-rv-concept",
        videoScene: "RVConceptScene",
        videoFile: "manim/chapters/ch02/scene_2_1_rv_concept.py",
        videoTitle: "随机变量：样本空间到实数轴的映射",
        videoConcept: "用箭头动画展示 Ω（样本点集合）→ℝ（实数轴）的映射本质，说明随机变量是函数。",
        videoIdeas: "左边画 Ω={H,T}（抛硬币），右边画数轴；X(H)=1、X(T)=0 用箭头映射；再切换到掷骰子 X=点数 展示连续型的铺垫。",
        interactiveId: "ch02-2.1-rv-mapper",
        componentName: "RVMapper",
        componentFile: "components/interactives/ch02/RVMapper.tsx",
        interactiveTitle: "随机变量映射器",
        interactiveConcept: "点击样本点为其指定一个实数值，构造自定义随机变量 X，实时展示 X 的分布律。",
        interactiveIdeas: "掷骰子样本空间 {1,2,3,4,5,6}，用户为每个样本点输入 X 值（默认 X=点数）；底部实时画出 P(X=x) 柱状图；切换按钮可预设 「X=奇偶」「X=点数平方」等经典变换。",
      },
      {
        id: "2.2",
        title: "离散型随机变量与常见分布",
        summary: "分布律的定义与性质；两点分布；二项分布 B(n,p)；泊松分布 P(λ)；泊松定理（二项逼近泊松）。",
        videoId: "ch02-2.2-discrete-dist",
        videoScene: "DiscreteDistScene",
        videoFile: "manim/chapters/ch02/scene_2_2_discrete_dist.py",
        videoTitle: "二项分布与泊松分布",
        videoConcept: "动画展示 B(10,0.3) 的分布律直方图，再演示 n→∞、p→0、np=λ 时收敛到泊松分布。",
        videoIdeas: "分步计算 P(X=k)=C(10,k)*0.3^k*0.7^(10-k)；画出完整直方图；再叠加相同 λ=3 的泊松分布曲线，动画展示二者的重合过程。",
        interactiveId: "ch02-2.2-binomial-explorer",
        componentName: "BinomialExplorer",
        componentFile: "components/interactives/ch02/BinomialExplorer.tsx",
        interactiveTitle: "二项/泊松分布探索器",
        interactiveConcept: "滑块调 n、p（或 λ），实时绘制分布律柱状图，切换二项/泊松，直观体会参数变化对形状的影响。",
        interactiveIdeas: "上方切换 B(n,p)/P(λ) 两个 tab；二项 tab 有 n[1..30]、p[0..1] 两个滑块；泊松 tab 有 λ[0.1..15] 滑块；SVG 柱状图实时更新 P(X=k)；显示均值 np 与方差 np(1-p)。",
      },
      {
        id: "2.3",
        title: "随机变量的分布函数",
        summary: "分布函数 F(x)=P(X≤x) 的定义；右连续性、单调不减、极限条件；离散型与连续型的 F(x) 图像；用 F(x) 计算区间概率。",
        videoId: "ch02-2.3-cdf",
        videoScene: "CDFScene",
        videoFile: "manim/chapters/ch02/scene_2_3_cdf.py",
        videoTitle: "分布函数：概率的累积",
        videoConcept: "对离散型：动画展示阶梯状 F(x)；对连续型：动画展示平滑 F(x) 曲线与 PDF 的积分关系。",
        videoIdeas: "先画 P(X=k) 离散直方图，右边动态生成对应阶梯 CDF；再切换为正态分布 PDF，高亮 x 左侧面积=F(x)；箭头连接 f(x) 与 F'(x)=f(x)。",
        interactiveId: "ch02-2.3-cdf-visualizer",
        componentName: "CDFVisualizer",
        componentFile: "components/interactives/ch02/CDFVisualizer.tsx",
        interactiveTitle: "分布函数可视化",
        interactiveConcept: "切换离散/连续分布，拖动 x 轴上的竖线，左侧阴影面积实时显示 F(x)=P(X≤x) 的数值。",
        interactiveIdeas: "上方切换离散(B(10,0.4))/连续(正态/指数)；SVG 画 PDF 或 PMF；可拖动的垂直滑块 x；左侧面积用 accent 色填充并显示数值；右侧显示 P(a≤X≤b) 双滑块计算区间概率。",
      },
      {
        id: "2.4",
        title: "连续型随机变量与常见连续分布",
        summary: "概率密度函数 f(x) 的定义与性质；均匀分布 U(a,b)；指数分布 Exp(λ) 与无记忆性；正态分布 N(μ,σ²) 与标准化；3σ规则。",
        videoId: "ch02-2.4-continuous-dist",
        videoScene: "ContDistScene",
        videoFile: "manim/chapters/ch02/scene_2_4_cont_dist.py",
        videoTitle: "连续分布：均匀、指数与正态",
        videoConcept: "依次展示三种连续分布的 PDF 形状，高亮关键性质：均匀的等高，指数的无记忆性，正态的 3σ 规则。",
        videoIdeas: "三幕：①均匀 U(0,1) 的矩形 PDF；②指数 Exp(1) 的下凸曲线，演示 P(X>s+t|X>s)=P(X>t)；③正态 N(0,1) 钟形，依次高亮 (-σ,σ)68%、(-2σ,2σ)95%、(-3σ,3σ)99.7%。",
        interactiveId: "ch02-2.4-pdf-explorer",
        componentName: "PDFExplorer",
        componentFile: "components/interactives/ch02/PDFExplorer.tsx",
        interactiveTitle: "连续分布密度函数探索器",
        interactiveConcept: "切换均匀/指数/正态分布，调参数，拖动区间端点，实时计算 P(a≤X≤b)（面积）。",
        interactiveIdeas: "顶部 tab 切换三种分布；参数滑块（a/b、λ、μ/σ）；SVG 画 f(x) 曲线；两个可拖动端点 a、b；端点之间面积用梯形近似填色并显示概率数值；指数分布额外显示「无记忆性验证」按钮。",
      },
      {
        id: "2.5",
        title: "随机变量函数的分布",
        summary: "已知 X 的分布，求 Y=g(X) 的分布；分布函数法（连续型）；单调函数的公式法；离散型直接列表法；典型例题：Y=X²、Y=e^X、Y=aX+b。",
        videoId: "ch02-2.5-func-dist",
        videoScene: "FuncDistScene",
        videoFile: "manim/chapters/ch02/scene_2_5_func_dist.py",
        videoTitle: "随机变量函数的分布",
        videoConcept: "用坐标变换动画展示 X~N(0,1)，Y=X² 的分布：从正态钟形曲线折叠到只剩正半轴，形成卡方(1)分布。",
        videoIdeas: "左边正态 PDF；中间 Y=x² 函数曲线；用分布函数法推导 F_Y(y)=P(X²≤y)=P(-√y≤X≤√y)；微分得 f_Y(y)；右边画出 χ²(1) 形状，与左边对比。",
        interactiveId: "ch02-2.5-func-dist-demo",
        componentName: "FuncDistDemo",
        componentFile: "components/interactives/ch02/FuncDistDemo.tsx",
        interactiveTitle: "随机变量函数分布演示",
        interactiveConcept: "选 X 的分布，选变换 Y=g(X)，并排展示 X 和 Y 的 PDF/PMF，直观看到「折叠/拉伸」效果。",
        interactiveIdeas: "左列：选 X 分布（标准正态/均匀(0,1)/指数(1)）；中列：选变换（Y=X²/Y=|X|/Y=2X+1/Y=e^X）；右列：数值模拟 Y 的直方图（10000次采样）+理论 PDF 曲线叠加；动态更新。",
      },
    ],
  },
  {
    id: "ch03",
    title: "多维随机变量及其分布",
    summary: "二维分布函数与联合分布；边缘分布；条件分布；随机变量的独立性；两个随机变量函数的分布（卷积）。",
    transcripts: ["概率论第十节多维随机变量分布讲解.txt", "概率论第十一节.txt", "概率论第十二节.txt"],
    sections: [
      {
        id: "3.1",
        title: "二维随机变量与联合分布",
        summary: "二维随机变量 (X,Y) 的概念；联合分布函数 F(x,y)=P(X≤x,Y≤y) 的定义与性质；离散型联合分布律；连续型联合概率密度 f(x,y)。",
        videoId: "ch03-3.1-joint-dist",
        videoScene: "JointDistScene",
        videoFile: "manim/chapters/ch03/scene_3_1_joint_dist.py",
        videoTitle: "二维随机变量与联合分布",
        videoConcept: "用二维坐标系中的散点/热力图展示离散联合分布律 p(xi,yj)，并演示联合分布函数 F(x,y) 是右下角体积。",
        videoIdeas: "三维坐标（x,y,P）画出离散 pij 的竖条；转换为热力图颜色编码；再演示 F(x,y) = Σ_{xi≤x,yj≤y} pij 的「左下角求和」动画。",
        interactiveId: "ch03-3.1-joint-dist-explorer",
        componentName: "JointDistExplorer",
        componentFile: "components/interactives/ch03/JointDistExplorer.tsx",
        interactiveTitle: "联合分布律探索器",
        interactiveConcept: "3×3 表格可编辑 p(xi,yj)，自动归一化，热力图实时展示联合分布，底部/右侧显示边缘分布。",
        interactiveIdeas: "3×3 输入网格（0~1），实时校验行列和并自动比例归一；热力图色阶（accent 渐变）；鼠标悬停格显示 P(X=xi,Y=yj) 数值；底部行=P(Y=yj) 边缘，右侧列=P(X=xi) 边缘。",
      },
      {
        id: "3.2",
        title: "边缘分布",
        summary: "边缘分布律/密度的定义（对另一变量求和/积分）；边缘 CDF 与联合 CDF 的关系；联合分布确定边缘分布但反过来不成立（说明独立性重要性）。",
        videoId: "ch03-3.2-marginal-dist",
        videoScene: "MarginalDistScene",
        videoFile: "manim/chapters/ch03/scene_3_2_marginal_dist.py",
        videoTitle: "边缘分布：从联合到单个",
        videoConcept: "动画展示联合分布表格逐行/列「折叠汇总」，得到 X 和 Y 各自的边缘分布律；连续型用积分阴影。",
        videoIdeas: "联合分布 3×3 表格高亮某列→对该列求和→显示 P(X=xi)；动画把每列数字汇聚到右侧边缘；同理对行汇聚到底部边缘。",
        interactiveId: "ch03-3.2-marginal-explorer",
        componentName: "MarginalExplorer",
        componentFile: "components/interactives/ch03/MarginalExplorer.tsx",
        interactiveTitle: "边缘分布提取演示",
        interactiveConcept: "从联合分布热力图中，点击某行/列即「投影」出该边缘分布，直观体会「对另一变量求和」的含义。",
        interactiveIdeas: "同 JointDistExplorer 的输入界面；点击行号高亮整行，右侧出现动画条形图=P(Y=yj)；点击列号同理；按钮切换「固定 X」「固定 Y」模式；额外展示两组不同联合分布却有相同边缘分布的反例。",
      },
      {
        id: "3.3",
        title: "条件分布",
        summary: "离散型条件分布律 P(X=xi|Y=yj)=p(xi,yj)/pj；连续型条件密度 f_{X|Y}(x|y)=f(x,y)/f_Y(y)；条件分布与联合分布的几何关系；条件期望的概念引入。",
        videoId: "ch03-3.3-conditional-dist",
        videoScene: "ConditionalDistScene",
        videoFile: "manim/chapters/ch03/scene_3_3_conditional_dist.py",
        videoTitle: "条件分布：固定一维看另一维",
        videoConcept: "高亮联合分布热力图的某一行 Y=yj，将该行归一化，动画展示条件分布 P(X|Y=yj) 的形成过程。",
        videoIdeas: "联合热力图；选中某行（Y=1）；该行数值除以 P(Y=1)（归一化）；动画把该行单独「弹出」成一个条形图=条件分布；强调条件分布是在已知 Y=yj 的「缩减样本空间」内的概率。",
        interactiveId: "ch03-3.3-conditional-explorer",
        componentName: "ConditionalExplorer",
        componentFile: "components/interactives/ch03/ConditionalExplorer.tsx",
        interactiveTitle: "条件分布可视化",
        interactiveConcept: "点击选定 Y=yj 的行，右侧自动计算并展示归一化后的 P(X|Y=yj)，与边缘 P(X) 并排对比。",
        interactiveIdeas: "联合分布 3×3 编辑表格；右侧并列两个柱状图：P(X) 边缘（固定颜色）vs P(X|Y=yj) 条件（accent 色，点击行触发）；加一个「相关性开关」，调整联合分布到独立/相关，观察条件分布是否改变。",
      },
      {
        id: "3.4",
        title: "随机变量的独立性",
        summary: "两个随机变量相互独立的定义：F(x,y)=F_X(x)F_Y(y) 等价于 f(x,y)=f_X(x)f_Y(y)（连续）或 p(xi,yj)=pi·qj（离散）；独立的充要条件；独立与不相关的关系（独立⟹不相关，反之不然）。",
        videoId: "ch03-3.4-rv-independence",
        videoScene: "RVIndepScene",
        videoFile: "manim/chapters/ch03/scene_3_4_rv_indep.py",
        videoTitle: "随机变量的独立性",
        videoConcept: "面积直观：独立⟺联合密度=边缘密度之积⟺联合分布热力图无「行列模式」，对比相关与独立两种热力图。",
        videoIdeas: "左边：不独立的联合分布热力图（有明显对角趋势）；右边：独立时的热力图（均匀乘积状）；动画演示 f(x,y)=f_X(x)·f_Y(y) 的「可分离」结构；最后一幕：不相关但不独立的例子（X~U(-1,1)，Y=X²）。",
        interactiveId: "ch03-3.4-independence-checker",
        componentName: "IndependenceChecker",
        componentFile: "components/interactives/ch03/IndependenceChecker.tsx",
        interactiveTitle: "独立性检验器",
        interactiveConcept: "编辑联合分布表，实时检验 p(xi,yj)=pi·qj 是否成立，用颜色高亮违反独立性的格子。",
        interactiveIdeas: "3×3 联合分布编辑网格；右侧计算边缘分布 pi=ΣjP(xi,yj) 和 qj；计算「独立参考分布」pi·qj；每个格子用颜色偏差（红=差距大、绿=接近）展示；底部显示「独立性指数」= max|p(xi,yj)-pi·qj|。",
      },
      {
        id: "3.5",
        title: "两个随机变量函数的分布",
        summary: "Z=X+Y 的分布（卷积公式）；正态分布的可加性；Z=max(X,Y) 和 Z=min(X,Y) 的分布；一般函数的分布函数法。",
        videoId: "ch03-3.5-sum-dist",
        videoScene: "SumDistScene",
        videoFile: "manim/chapters/ch03/scene_3_5_sum_dist.py",
        videoTitle: "两随机变量之和的分布",
        videoConcept: "动画演示卷积：X~U(0,1)，Y~U(0,1) 独立，Z=X+Y 的 PDF 是三角形（对流卷积）；再展示正态+正态还是正态。",
        videoIdeas: "两个矩形 PDF（均匀分布）；动画展示卷积积分：扫描一个 PDF 的翻转，与另一 PDF 相乘取面积；结果三角形 PDF 动画生长；第二幕：两个正态相加成新正态，强调 μ 相加、σ² 相加。",
        interactiveId: "ch03-3.5-convolution-demo",
        componentName: "ConvolutionDemo",
        componentFile: "components/interactives/ch03/ConvolutionDemo.tsx",
        interactiveTitle: "卷积：两独立随机变量之和",
        interactiveConcept: "选 X 和 Y 各自的分布类型和参数，用蒙特卡洛模拟 Z=X+Y，展示 Z 的经验分布与理论 PDF。",
        interactiveIdeas: "两列 tab（X、Y）各选分布类型与参数；「模拟」按钮生成 5000 对 (X,Y)，计算 Z=X+Y；SVG 直方图展示 Z 的经验分布；叠加理论 PDF（若有解析式则显示）；额外一行展示均值/方差公式 E[Z]=E[X]+E[Y]。",
      },
    ],
  },
  {
    id: "ch04",
    title: "随机变量的数字特征",
    summary: "数学期望（离散/连续/函数期望）；方差与标准差；协方差与相关系数；矩与协方差矩阵。",
    transcripts: ["概率论第13节 随机变量期望方差性质讲解.txt", "概率论第14节 相关系数与大数定律讲解.txt"],
    sections: [
      {
        id: "4.1",
        title: "数学期望",
        summary: "离散型期望 E[X]=Σxi·pi；连续型期望 E[X]=∫x·f(x)dx；随机变量函数的期望 E[g(X)]；期望的线性性质；常见分布的期望。",
        videoId: "ch04-4.1-expectation",
        videoScene: "ExpectationScene",
        videoFile: "manim/chapters/ch04/scene_4_1_expectation.py",
        videoTitle: "数学期望：概率加权的中心",
        videoConcept: "用杠杆平衡类比：各样本点的「重量」是概率，期望是平衡支点；动画展示不同分布的重心位置。",
        videoIdeas: "数轴上分布的各点用垂直线段（高度=概率）表示；一根杠杆；在 E[X] 处支撑恰好平衡；动画拖动支点，力矩失衡直到找到均值；第二幕：连续分布 f(x)，积分∫x·f(x)dx 的累积动画。",
        interactiveId: "ch04-4.1-expectation-explorer",
        componentName: "ExpectationExplorer",
        componentFile: "components/interactives/ch04/ExpectationExplorer.tsx",
        interactiveTitle: "期望：加权重心探索器",
        interactiveConcept: "可拖动数轴上的概率质量块，实时看到期望「重心」移动，直观体会期望=加权平均。",
        interactiveIdeas: "5个离散质量块（x值和高度/概率可拖动调整）；底部数轴上有▽标记实时显示 E[X]；概率和 ≠1 时红色警告；额外显示 E[X²]、E[X]² 和方差 D[X]=E[X²]-E[X]²；常见分布一键导入按钮（二项/泊松/几何）。",
      },
      {
        id: "4.2",
        title: "方差与标准差",
        summary: "方差 D(X)=E[(X-μ)²] 的定义；计算公式 D(X)=E[X²]-(E[X])²；方差的性质（线性变换）；标准差与标准化；常见分布的方差。",
        videoId: "ch04-4.2-variance",
        videoScene: "VarianceScene",
        videoFile: "manim/chapters/ch04/scene_4_2_variance.py",
        videoTitle: "方差：偏离均值的平均平方",
        videoConcept: "动画演示 D(X) = E[(X-μ)²]：从 PDF 每个点到均值的偏差→平方→加权求和/积分；对比高方差与低方差的分布形态。",
        videoIdeas: "正态分布 PDF；μ=0 处垂直虚线；对若干 x 点画出 (x-μ)² 的小矩形（高度=偏差平方，宽度=概率密度）；加权面积之和=方差；并列展示 σ=0.5 和 σ=2 的钟形，直观对比宽窄。",
        interactiveId: "ch04-4.2-variance-explorer",
        componentName: "VarianceExplorer",
        componentFile: "components/interactives/ch04/VarianceExplorer.tsx",
        interactiveTitle: "方差与分布扩散度可视化",
        interactiveConcept: "并排两个正态分布，独立调 μ 和 σ，实时看到曲线形状变化，量化均值/方差/标准差。",
        interactiveIdeas: "并排两个 SVG 正态 PDF（蓝、橙）；各有 μ[-3,3] 和 σ[0.3,3] 两个滑块；共同数轴；±1σ、±2σ 区域填色；数值面板显示 E[X]=μ、D[X]=σ²、σ；底部显示 D(aX+b)=a²D(X) 的验算。",
      },
      {
        id: "4.3",
        title: "协方差与相关系数",
        summary: "协方差 Cov(X,Y)=E[(X-μX)(Y-μY)]；计算简化公式；相关系数 ρ∈[-1,1]；ρ=0（不相关）vs 独立；不相关不一定独立的反例；二维正态的特殊性。",
        videoId: "ch04-4.3-covariance",
        videoScene: "CovScene",
        videoFile: "manim/chapters/ch04/scene_4_3_covariance.py",
        videoTitle: "协方差与相关系数",
        videoConcept: "散点云动画：ρ从-1变化到+1，散点从「左上-右下」椭圆→圆形→「左下-右上」椭圆，体会相关性方向与强度。",
        videoIdeas: "二维正态散点云（100点）；ρ参数动画从-0.9→0→0.9；散点云形状实时变化；同时显示相关系数数值；额外展示 X~U(-1,1)、Y=X²：散点呈抛物线，Cov=0 但显然不独立（不相关≠独立）。",
        interactiveId: "ch04-4.3-correlation-explorer",
        componentName: "CorrelationExplorer",
        componentFile: "components/interactives/ch04/CorrelationExplorer.tsx",
        interactiveTitle: "相关系数可视化实验室",
        interactiveConcept: "拖动 ρ 滑块实时生成对应散点云，展示相关系数的几何意义；额外演示不相关但不独立的案例。",
        interactiveIdeas: "ρ[-1,1] 滑块；实时生成 200 点的二维正态散点；计算样本相关系数显示在右上角；四个角标注限制线（±1 时退化为直线）；底部按钮展示「不相关但不独立」案例（Y=X² 散点）。",
      },
      {
        id: "4.4",
        title: "矩与协方差矩阵",
        summary: "k阶原点矩 E[X^k]、k阶中心矩 E[(X-μ)^k]；偏度与峰度（简介）；二维协方差矩阵 Σ；协方差矩阵的几何意义（椭圆方程）；多维正态分布简介。",
        videoId: "ch04-4.4-moments",
        videoScene: "MomentsScene",
        videoFile: "manim/chapters/ch04/scene_4_4_moments.py",
        videoTitle: "矩与协方差矩阵的几何意义",
        videoConcept: "动画展示协方差矩阵Σ如何决定椭圆的形状、方向和大小；主轴方向=特征向量，主轴长=特征值开方。",
        videoIdeas: "单位圆→被Σ线性变换→椭圆；画出特征向量方向（主轴）和对应长度；调整Σ的参数（对角、相关）看椭圆旋转缩放；对应二维正态等高线的椭圆族。",
        interactiveId: "ch04-4.4-cov-matrix-demo",
        componentName: "CovMatrixDemo",
        componentFile: "components/interactives/ch04/CovMatrixDemo.tsx",
        interactiveTitle: "协方差矩阵与等高线椭圆",
        interactiveConcept: "调整 2×2 协方差矩阵的四个元素，实时看到二维正态分布等高线椭圆的形状和方向变化。",
        interactiveIdeas: "2×2 矩阵输入（保持半正定：σ₁²、σ₂²>0，|ρσ₁σ₂|<σ₁σ₂）；SVG 画等高线椭圆（3条）；标注长短半轴=√λ₁, √λ₂；显示特征值/特征向量（简化数值）；矩阵非正定时红色警告。",
      },
    ],
  },
  {
    id: "ch05",
    title: "大数定律与中心极限定理",
    summary: "切比雪夫不等式；弱大数定律（伯努利大数定律、辛钦大数定律）；中心极限定理（林德伯格-莱维）及其应用。",
    transcripts: ["概率论第15节 概率论数理统计.txt"],
    sections: [
      {
        id: "5.1",
        title: "切比雪夫不等式",
        summary: "切比雪夫不等式 P(|X-μ|≥ε)≤σ²/ε²；由方差上界推偏离概率上界；用途：在不知分布具体形式时给出概率界；与大数定律的关系（用不等式证明大数定律）。",
        videoId: "ch05-5.1-chebyshev",
        videoScene: "ChebyshevScene",
        videoFile: "manim/chapters/ch05/scene_5_1_chebyshev.py",
        videoTitle: "切比雪夫不等式的几何直觉",
        videoConcept: "PDF 曲线下，将 ε 范围外的「尾部」面积与 σ²/ε² 上界做动画比较；拖动 ε 增大时尾部面积与上界同步收缩。",
        videoIdeas: "正态分布 PDF；μ±ε 垂直线；尾部填色（红色）；右上角显示 P(|X-μ|≥ε) 数值 vs σ²/ε² 上界；ε 从 0.5σ 动画增大到 3σ，两个数值都减小但上界始终≥真实概率。",
        interactiveId: "ch05-5.1-chebyshev-demo",
        componentName: "ChebyshevDemo",
        componentFile: "components/interactives/ch05/ChebyshevDemo.tsx",
        interactiveTitle: "切比雪夫不等式演示",
        interactiveConcept: "调 ε 和 σ，实时看到概率尾部与切比雪夫上界的数值对比，直观体会不等式的松紧程度。",
        interactiveIdeas: "正态分布 SVG（固定 μ=0）；σ[0.5,3] 和 ε[0.1,5] 两个滑块；尾部面积高亮（精确值用数值积分近似）；右侧显示三行：真实 P(|X|≥ε)、切比雪夫上界 σ²/ε²、比值（上界/真实）；比值越大说明不等式越松。",
      },
      {
        id: "5.2",
        title: "大数定律",
        summary: "依概率收敛的定义；伯努利大数定律（频率稳定于概率）；辛钦大数定律（样本均值稳定于总体均值）；大数定律的统计意义：为统计推断奠基。",
        videoId: "ch05-5.2-lln",
        videoScene: "LLNScene",
        videoFile: "manim/chapters/ch05/scene_5_2_lln.py",
        videoTitle: "大数定律：样本均值的收敛",
        videoConcept: "动画展示多条样本均值折线随 n 增大在 μ 两侧趋于平稳，并与 ε 带动画收缩对应，体会「依概率收敛」。",
        videoIdeas: "绘制 5 条独立模拟折线（X̄n vs n）；μ=0 水平虚线；±ε 带逐渐收窄；各折线最终都夹在带内；右下角计数「5条中有 k 条在 ε-带内」概率趋于 1。",
        interactiveId: "ch05-5.2-lln-simulator",
        componentName: "LLNSimulator",
        componentFile: "components/interactives/ch05/LLNSimulator.tsx",
        interactiveTitle: "大数定律模拟器",
        interactiveConcept: "选分布、调 ε，批量模拟样本均值折线，可视化展示「n 越大，超出 ε 带的折线比例越小」。",
        interactiveIdeas: "选分布（伯努利/均匀/指数）；n[10,1000] 滑块；ε[0.05,0.5] 滑块；「模拟」按钮生成 20 条 X̄n 折线；ε 带高亮；底部折线图展示「超出带的折线比例 vs n」趋于 0；实时显示 P(|X̄n-μ|>ε) 切比雪夫上界公式。",
      },
      {
        id: "5.3",
        title: "中心极限定理",
        summary: "林德伯格-莱维中心极限定理：i.i.d.、有限方差时 √n(X̄n-μ)/σ → N(0,1)；实用形式：X̄n 近似 N(μ,σ²/n)，ΣXi 近似 N(nμ,nσ²)；棣莫弗-拉普拉斯定理；正态近似的使用条件与例题。",
        videoId: "ch05-5.3-clt",
        videoScene: "CLTScene",
        videoFile: "manim/chapters/ch05/scene_5_3_clt.py",
        videoTitle: "中心极限定理：任何分布加起来都变正态",
        videoConcept: "动画展示从均匀分布开始，每次对 n 个独立样本求和，直方图从矩形→三角形→逐步收敛到正态钟形。",
        videoIdeas: "均匀分布 PDF（n=1 时矩形）；n=2 三角形；n=5 开始圆弧；n=30 接近正态；每步叠加标准化正态曲线（黑色虚线）；最终 n=30 时几乎重合；配以「此时 (X̄n-μ)/(σ/√n) ≈ N(0,1)」文字。",
        interactiveId: "ch05-5.3-clt-simulator",
        componentName: "CLTSimulator",
        componentFile: "components/interactives/ch05/CLTSimulator.tsx",
        interactiveTitle: "中心极限定理模拟实验室",
        interactiveConcept: "任选底层分布（均匀/指数/泊松/二项），拖动 n，实时看样本均值的标准化直方图收敛到 N(0,1)。",
        interactiveIdeas: "顶部 4 个分布按钮；n[1,50] 滑块；「模拟 10000组」按钮；计算每组的 X̄n，标准化后画直方图；叠加 N(0,1) 的理论 PDF 曲线；样本量说明（n≥30 通常够用）；显示 K-S 统计量量化与正态的接近程度。",
      },
    ],
  },
  {
    id: "ch06",
    title: "样本及抽样分布",
    summary: "总体与样本；统计量（均值、方差、顺序统计量）；χ²分布、t分布、F分布；正态总体的抽样分布定理。",
    transcripts: ["概率论第16节 统计课程之样本与分布讲解.txt", "概率论-第17节.txt"],
    sections: [
      {
        id: "6.1",
        title: "总体、样本与统计量",
        summary: "总体（随机变量）与个体；简单随机样本（i.i.d.）；统计量的定义（不含未知参数的样本函数）；样本均值 X̄、样本方差 S²（分母 n-1 原因）、样本标准差 S；为什么用 n-1（无偏性）。",
        videoId: "ch06-6.1-population-sample",
        videoScene: "PopSampleScene",
        videoFile: "manim/chapters/ch06/scene_6_1_pop_sample.py",
        videoTitle: "总体、样本与统计量",
        videoConcept: "动画展示从大圆（总体/分布）中随机抽 n 个点（样本），计算 X̄ 和 S²，体现统计量是样本的函数。",
        videoIdeas: "大圆=正态总体，内有密集点；箭头随机抽 n=8 个点放到「样本框」；计算 X̄ = (x1+...+xn)/n；计算 S² 时强调分母 n-1；公式旁边注释「为什么 n-1：E[S²]=σ²，无偏！」。",
        interactiveId: "ch06-6.1-statistic-calculator",
        componentName: "StatisticCalculator",
        componentFile: "components/interactives/ch06/StatisticCalculator.tsx",
        interactiveTitle: "统计量计算器",
        interactiveConcept: "输入或随机生成一组样本数据，实时计算 X̄、S²（n-1）、S、顺序统计量，并展示每步计算过程。",
        interactiveIdeas: "可手动输入数字（空格分隔）或点击「随机生成」（选正态/均匀）；显示计算步骤：Σxi、X̄、偏差 (xi-X̄)²、ΣΩ²/(n-1)=S²；数轴展示各样本点、X̄ 位置和 X̄±S 范围；切换分母 n vs n-1，直观看无偏差异。",
      },
      {
        id: "6.2",
        title: "三大抽样分布",
        summary: "χ²(n) 分布（n 个独立标准正态平方和）；t(n) 分布（X/√(χ²/n) 的结构与对称性）；F(m,n) 分布（两χ²之比）；各分布的 PDF 形状与自由度的影响；临界值的使用。",
        videoId: "ch06-6.2-sampling-dist",
        videoScene: "ThreeDistScene",
        videoFile: "manim/chapters/ch06/scene_6_2_three_dist.py",
        videoTitle: "三大抽样分布：χ²、t、F",
        videoConcept: "动画展示三个分布的构造逻辑：标准正态→χ²→t→F，每步用公式+PDF 形状动画；自由度增大时各分布趋于正态/χ²。",
        videoIdeas: "第一幕：Z~N(0,1)，Z²~χ²(1)，n个Z²之和~χ²(n)，画出 n=1,3,10 的χ²密度；第二幕：t=Z/√(χ²(n)/n)，n增大趋于标准正态，对比画出 t(1)、t(5)、N(0,1)；第三幕：F=χ²(m)/m ÷ χ²(n)/n，密度右偏。",
        interactiveId: "ch06-6.2-sampling-dist-explorer",
        componentName: "SamplingDistExplorer",
        componentFile: "components/interactives/ch06/SamplingDistExplorer.tsx",
        interactiveTitle: "三大抽样分布探索器",
        interactiveConcept: "切换 χ²/t/F 分布，调自由度参数，实时展示 PDF 曲线与临界值（α=0.05/0.01）。",
        interactiveIdeas: "三个 tab（χ²(n)、t(n)、F(m,n)）；各自的自由度滑块；SVG 密度曲线（用数值近似）；右尾显著性水平 α[0.01,0.1] 滑块；高亮右尾面积=α，显示临界值 χ²α(n)/tα/2(n)/Fα(m,n)；底部展示「n→∞ 时接近正态」对比。",
      },
      {
        id: "6.3",
        title: "正态总体的抽样分布定理",
        summary: "X~N(μ,σ²) 时：X̄~N(μ,σ²/n)；(n-1)S²/σ²~χ²(n-1)；X̄与S²相互独立（正态总体独有性质）；(X̄-μ)/(S/√n)~t(n-1)；这四个结论是区间估计和假设检验的基石。",
        videoId: "ch06-6.3-normal-sampling",
        videoScene: "NormalSamplingScene",
        videoFile: "manim/chapters/ch06/scene_6_3_normal_sampling.py",
        videoTitle: "正态总体的四大抽样分布定理",
        videoConcept: "逐一演示四个定理：从正态总体抽样→计算统计量→标注其所服从的分布，强调各定理的条件。",
        videoIdeas: "第一幕：N(μ,σ²)→多次抽样计算X̄→X̄的直方图+N(μ,σ²/n)叠加；第二幕：(n-1)S²/σ²的直方图+χ²(n-1)叠加；第三幕：(X̄-μ)/(S/√n) 的直方图+t(n-1)叠加；文字「σ²未知时用S替代，代价是自由度n-1」。",
        interactiveId: "ch06-6.3-normal-sampling-demo",
        componentName: "NormalSamplingDemo",
        componentFile: "components/interactives/ch06/NormalSamplingDemo.tsx",
        interactiveTitle: "正态总体抽样分布仿真",
        interactiveConcept: "设定正态总体参数和样本量 n，大量重复抽样，实证验证四大定理（X̄、S²、t统计量的分布）。",
        interactiveIdeas: "μ[-2,2]、σ[0.5,3]、n[2,30] 三个滑块；「重复抽样 5000次」按钮；四个并排直方图：X̄ vs N(μ,σ²/n)，(n-1)S²/σ² vs χ²(n-1)，t=(X̄-μ)/(S/√n) vs t(n-1)，每图叠加理论 PDF；底部 K-S 检验 p值。",
      },
      {
        id: "6.4",
        title: "样本分位数与顺序统计量",
        summary: "顺序统计量 X(1)≤X(2)≤…≤X(n) 的概念；最小/最大值分布；样本中位数；分位数的概念与实际应用（Q-Q图直觉）；与参数估计的联系。",
        videoId: "ch06-6.4-order-stat",
        videoScene: "OrderStatScene",
        videoFile: "manim/chapters/ch06/scene_6_4_order_stat.py",
        videoTitle: "顺序统计量与样本分位数",
        videoConcept: "动画演示从无序样本到排序后的顺序统计量，展示最小值X(1)和最大值X(n)的分布随n变化（趋向总体极端）。",
        videoIdeas: "n=10 个随机点从总体中抽出→排序动画→X(1)（最小）高亮；多次重复抽样，X(1)值的直方图=顺序统计量分布；n从5增大到50，X(1)的分布向总体左端缩并；中位数 X((n+1)/2) 的直方图趋于正态。",
        interactiveId: "ch06-6.4-quantile-explorer",
        componentName: "QuantileExplorer",
        componentFile: "components/interactives/ch06/QuantileExplorer.tsx",
        interactiveTitle: "样本分位数与 Q-Q 图",
        interactiveConcept: "生成样本，展示各顺序统计量，绘制 Q-Q 图（与正态理论分位数对比），判断是否来自正态总体。",
        interactiveIdeas: "选总体分布（正态/均匀/指数）；n[10,100] 滑块；「抽样」按钮；显示排序后样本；Q-Q 图（横轴=理论正态分位数，纵轴=样本分位数）；来自正态则点沿对角线，均匀/指数则偏离；旁注「这就是正态性检验的直觉」。",
      },
    ],
  },
  {
    id: "ch07",
    title: "参数估计",
    summary: "矩估计与极大似然估计（两大点估计方法）；估计量的评选标准（无偏性/有效性/相合性）；区间估计（置信区间）。",
    transcripts: ["概率论数理统计.txt"],
    sections: [
      {
        id: "7.1",
        title: "矩估计法",
        summary: "替换原理：用样本矩替换总体矩；一阶矩（均值）→估计 μ 或 λ 等；二阶矩→估计 σ²；以指数分布、均匀分布为例写出矩估计量的完整推导过程。",
        videoId: "ch07-7.1-moment-est",
        videoScene: "MomentEstScene",
        videoFile: "manim/chapters/ch07/scene_7_1_moment_est.py",
        videoTitle: "矩估计法：用样本矩替换总体矩",
        videoConcept: "动画演示指数分布 Exp(λ) 的矩估计：E[X]=1/λ，令 X̄=1/λ̂，解出 λ̂=1/X̄；体现「替换」思想。",
        videoIdeas: "黑板风格；写出总体矩 E[X]=1/λ；箭头替换 E[X]→X̄；解方程 λ̂=1/X̄；代入模拟样本数值；旁边展示随着 n 增大 λ̂ 越来越接近真实 λ；同时展示均匀分布 U(0,θ) 的二阶矩估计（θ̂=√(3·(1/n)Σxi²)）。",
        interactiveId: "ch07-7.1-moment-estimator",
        componentName: "MomentEstimator",
        componentFile: "components/interactives/ch07/MomentEstimator.tsx",
        interactiveTitle: "矩估计量计算器",
        interactiveConcept: "选分布（指数/正态/均匀），输入样本，自动推导矩估计量公式并代入样本矩给出数值估计。",
        interactiveIdeas: "三个分布 tab；样本输入框（逗号分隔）或「随机生成」按钮；显示推导步骤（LaTeX 渲染）：总体矩表达式→替换→矩估计量公式→代入数值→θ̂；n 增大时与真实参数对比折线图。",
      },
      {
        id: "7.2",
        title: "最大似然估计",
        summary: "似然函数 L(θ) 的定义与直觉（给定数据，θ 多大时数据最可能出现）；对数似然；MLE 的求解步骤（令对数似然导数=0）；以二项/正态/指数为例；MLE 的不变性原理。",
        videoId: "ch07-7.2-mle",
        videoScene: "MLEScene",
        videoFile: "manim/chapters/ch07/scene_7_2_mle.py",
        videoTitle: "极大似然估计：让数据最可能出现的参数",
        videoConcept: "动画展示似然函数 L(λ|data) 的曲线（以指数分布为例），MLE 就是峰值处的参数值。",
        videoIdeas: "一组指数分布观测值 {0.5,1.2,0.8,2.1}；画出 L(λ)=∏λ·e^(-λxi)（取对数更好）的曲线；垂直虚线标注最大值点 λ̂=n/Σxi；动画展示随 data 变化 λ̂ 如何变化；第二幕：正态分布的联合 MLE（μ̂=X̄，σ̂²=(1/n)Σ(xi-X̄)²）。",
        interactiveId: "ch07-7.2-mle-explorer",
        componentName: "MLEExplorer",
        componentFile: "components/interactives/ch07/MLEExplorer.tsx",
        interactiveTitle: "极大似然估计可视化",
        interactiveConcept: "输入样本数据，展示对数似然函数曲线，标注 MLE 峰值，并允许用户拖动参数感受似然如何随 θ 变化。",
        interactiveIdeas: "切换分布（指数/伯努利）；样本数据框（可编辑）；SVG 展示 logL(θ) vs θ 曲线（数值计算）；MLE θ̂ 处用▽标注；可拖动蓝色竖线到任意 θ，显示对应 logL 值；底部公式 θ̂=... 随数据变化实时更新。",
      },
      {
        id: "7.3",
        title: "估计量的评选标准",
        summary: "无偏性（E[θ̂]=θ）；有效性（方差最小，CR 下界）；相合性（θ̂→θ，n→∞）；以样本均值 vs (n-1)S² vs nS² 的方差为例；渐近正态性；估计量的均方误差 MSE=偏差²+方差。",
        videoId: "ch07-7.3-estimator-quality",
        videoScene: "EstQualityScene",
        videoFile: "manim/chapters/ch07/scene_7_3_est_quality.py",
        videoTitle: "好估计量的三个标准：无偏、有效、相合",
        videoConcept: "靶心类比：无偏=箭头的均值打中靶心；有效=散布最小；相合=n增大时命中率趋于1；四象限展示四种组合。",
        videoIdeas: "靶心图（2×2）：①无偏有效（散布小且居中）②无偏低效（散布大但居中）③有偏低方差（集中但偏离）④有偏高方差（最差）；第二幕：数轴上多个估计量的分布（箱线图式）随 n 增大收缩，相合估计的「收缩动画」。",
        interactiveId: "ch07-7.3-estimator-comparator",
        componentName: "EstimatorComparator",
        componentFile: "components/interactives/ch07/EstimatorComparator.tsx",
        interactiveTitle: "估计量性质比较器",
        interactiveConcept: "大量重复抽样，可视化比较 X̄（均值估计）、S²（无偏方差）和 Sn²（有偏方差）的分布，验证无偏性和相合性。",
        interactiveIdeas: "正态总体（μ/σ已知）；n[5,100] 滑块；「模拟 2000次」按钮；三个箱线图：X̄, S²=Σ(xi-X̄)²/(n-1), Sn²=Σ(xi-X̄)²/n；用红色虚线标注真实参数值；中心高亮「有偏/无偏」；n 变化时 Sn² 的偏差从可见→消失（相合性）。",
      },
      {
        id: "7.4",
        title: "区间估计",
        summary: "点估计 vs 区间估计；置信区间 (L,U) 的定义 P(L≤θ≤U)=1-α；置信水平 1-α；枢轴量法；正态总体 μ 的置信区间（σ已知用 Z，σ未知用 t）；正态总体 σ² 的置信区间（χ²分布）；区间长度与样本量的关系。",
        videoId: "ch07-7.4-conf-interval",
        videoScene: "ConfIntervalScene",
        videoFile: "manim/chapters/ch07/scene_7_4_conf_interval.py",
        videoTitle: "置信区间：捕获真实参数的随机区间",
        videoConcept: "动画展示 100 次重复抽样，每次计算一个置信区间（水平线段），其中约 95 条覆盖真实 μ（绿色），约 5 条不覆盖（红色）。",
        videoIdeas: "真实 μ=2 的垂直线；依次显示 100 条水平区间（每条宽度略不同）；约 5条（红色）不穿过 μ 线，其余 95 条（绿色）穿过；右上角计数「95/100 覆盖了真实 μ」；强调「95%置信度不是概率，是频率概念」。",
        interactiveId: "ch07-7.4-conf-interval-explorer",
        componentName: "ConfidenceIntervalExplorer",
        componentFile: "components/interactives/ch07/ConfidenceIntervalExplorer.tsx",
        interactiveTitle: "置信区间捕获率可视化",
        interactiveConcept: "设定置信水平、样本量，批量模拟抽样，可视化每次的置信区间，统计实际覆盖率是否接近声称的 1-α。",
        interactiveIdeas: "置信水平 1-α[0.80,0.99] 滑块；n[5,50] 滑块；「模拟 50次」按钮（可多次点击累积）；垂直 μ 线；水平区间（绿=覆盖/红=不覆盖）纵向排列；右侧显示「覆盖次数/总次数=xxx%」并与 1-α 对比；说明面板：σ已知用Z，未知用t。",
      },
    ],
  },
  {
    id: "ch08",
    title: "假设检验",
    summary: "假设检验的基本思想（小概率原理）；两类错误（α弃真、β纳伪）；正态总体均值与方差的假设检验（Z检验、t检验、χ²检验）；两正态总体的比较；p值。",
    transcripts: [],
    sections: [
      {
        id: "8.1",
        title: "假设检验的基本思想",
        summary: "原假设 H0 与备择假设 H1；小概率原理（α=0.05 时小概率事件若发生则拒绝 H0）；检验统计量与拒绝域；显著性水平 α 的含义；第一类错误（弃真）vs 第二类错误（纳伪）；假设检验的决策逻辑。",
        videoId: "ch08-8.1-hyp-test-intro",
        videoScene: "HypTestIntroScene",
        videoFile: "manim/chapters/ch08/scene_8_1_hyp_test_intro.py",
        videoTitle: "假设检验：小概率反证法",
        videoConcept: "类比法庭判决（无罪推定=H0，有罪证据=小概率事件出现），动画展示检验统计量落入拒绝域则拒绝H0的逻辑。",
        videoIdeas: "标准正态分布；α=0.05 时右侧 1.645 以右高亮（拒绝域）；一个观测值 z=2.1 落在拒绝域内→「拒绝 H0」；另一个 z=0.8 落在接受域→「不拒绝 H0」；强调「不拒绝≠接受」；左尾/右尾/双尾三种拒绝域示意。",
        interactiveId: "ch08-8.1-hyp-test-demo",
        componentName: "HypTestDemo",
        componentFile: "components/interactives/ch08/HypTestDemo.tsx",
        interactiveTitle: "假设检验直觉演示",
        interactiveConcept: "调显著性水平 α 和观测到的检验统计量 z，实时看到拒绝域变化和决策结果（拒绝/不拒绝 H0）。",
        interactiveIdeas: "正态分布 SVG；α[0.01,0.10] 滑块（控制拒绝域临界值）；检验统计量 z[-3,3] 滑块；三种检验类型（左尾/右尾/双尾）按钮；拒绝域填 accent 色；z 所在位置用▽标注；决策结果显示「拒绝 H0（p<α）」或「不拒绝 H0（p≥α）」；p 值实时计算显示。",
      },
      {
        id: "8.2",
        title: "正态总体均值的假设检验",
        summary: "σ²已知时的 Z 检验（统计量 Z=(X̄-μ0)/(σ/√n)）；σ²未知时的 t 检验（统计量 T=(X̄-μ0)/(S/√n)，t(n-1)分布）；双边检验与单边检验；两个正态总体均值之差的检验；检验的步骤与例题。",
        videoId: "ch08-8.2-mean-test",
        videoScene: "MeanTestScene",
        videoFile: "manim/chapters/ch08/scene_8_2_mean_test.py",
        videoTitle: "均值检验：Z 检验与 t 检验",
        videoConcept: "并排展示 Z 检验（σ已知，N(0,1)拒绝域）和 t 检验（σ未知，t(n-1)拒绝域更宽），对比自由度对临界值的影响。",
        videoIdeas: "左：N(0,1)密度，α/2=0.025 双尾拒绝域（|Z|>1.96）；右：t(5)密度，同 α/2 拒绝域（|T|>2.571，更宽）；n从5增大到∞，t临界值收缩到Z临界值；强调「σ未知用t，代价是临界值更大（更难拒绝H0）」。",
        interactiveId: "ch08-8.2-mean-test-explorer",
        componentName: "MeanTestExplorer",
        componentFile: "components/interactives/ch08/MeanTestExplorer.tsx",
        interactiveTitle: "均值假设检验计算器",
        interactiveConcept: "输入样本统计量，选 Z/t 检验和检验方向，自动计算检验统计量和 p 值，判断在给定 α 下是否拒绝 H0。",
        interactiveIdeas: "两个 tab（Z检验/t检验）；输入：X̄、n、σ（Z）或S（t）、μ0（原假设均值）；选左尾/右尾/双尾；计算Z或T值；SVG展示对应分布及拒绝域，标注Z/T值位置；输出p值、临界值和结论；公式推导步骤展开。",
      },
      {
        id: "8.3",
        title: "正态总体方差的假设检验",
        summary: "单个正态总体方差的 χ² 检验（统计量 χ²=(n-1)S²/σ0²）；两个正态总体方差比的 F 检验；检验的拒绝域；单/双侧检验；例题与实际应用（质量控制）。",
        videoId: "ch08-8.3-variance-test",
        videoScene: "VarTestScene",
        videoFile: "manim/chapters/ch08/scene_8_3_var_test.py",
        videoTitle: "方差检验：χ² 检验与 F 检验",
        videoConcept: "χ²(n-1) 分布密度，标注双尾拒绝域（χ²<χ²_{1-α/2} 或 χ²>χ²_{α/2}）；对比右偏分布与正态的拒绝域不对称。",
        videoIdeas: "χ²(9) 分布密度（右偏）；α=0.05 双侧：左临界值2.7，右临界值19.0；高亮两端拒绝域；观测值 χ²=15 在接受域→不拒绝；第二幕：F(5,8)分布，F检验右侧单尾（通常用 F>Fα(m,n) 作为拒绝域）。",
        interactiveId: "ch08-8.3-variance-test-explorer",
        componentName: "VarianceTestExplorer",
        componentFile: "components/interactives/ch08/VarianceTestExplorer.tsx",
        interactiveTitle: "方差假设检验计算器",
        interactiveConcept: "输入样本方差 S²、样本量 n、假设方差 σ₀²，计算 χ² 统计量，在分布图上标注位置，给出检验结论。",
        interactiveIdeas: "输入：S²、n、σ₀²、α（显著性水平）、检验方向（左/右/双侧）；计算 χ²=(n-1)S²/σ₀²；SVG 画 χ²(n-1) 密度；标注拒绝域（高亮填色）和计算得到的 χ² 值（▽标注）；输出：χ² 值、p 值（数值近似）、临界值、结论。",
      },
      {
        id: "8.4",
        title: "两类错误与检验功效",
        summary: "第一类错误（弃真，概率=α）vs 第二类错误（纳伪，概率=β）；α 与 β 的权衡；势函数 W(θ) = P(拒绝H0|θ)；功效 = 1-β；样本量对两类错误的影响；最优检验简介；假设检验的局限与 p 值的正确解读。",
        videoId: "ch08-8.4-two-errors",
        videoScene: "TwoErrorScene",
        videoFile: "manim/chapters/ch08/scene_8_4_two_errors.py",
        videoTitle: "两类错误与功效曲线",
        videoConcept: "并排两个分布：H0下的 N(μ0,σ²/n) 和 H1下的 N(μ1,σ²/n)；拒绝域分割点左右两侧分别标注 α（右尾）和 β（左尾）；调整分割点看 α 增大则 β 减小的权衡。",
        videoIdeas: "左分布 N(0,1)（H0），右分布 N(2,1)（H1）；垂直分割线 c；左图右尾=α（弃真错误），右图左尾=β（纳伪错误）；c 从-0.5到3.0 滑动动画，α/β 面积此消彼长；第二幕：n增大后两个分布更分离，α和β都能变小。",
        interactiveId: "ch08-8.4-error-type-demo",
        componentName: "ErrorTypeDemo",
        componentFile: "components/interactives/ch08/ErrorTypeDemo.tsx",
        interactiveTitle: "两类错误权衡可视化",
        interactiveConcept: "调整显著性水平 α（或等价地移动拒绝域边界），实时看到 α（第一类）和 β（第二类）错误概率的此消彼长。",
        interactiveIdeas: "两个正态 PDF（H0=μ0=0，H1=μ1=δ，用 δ[0.5,3] 滑块控制效应量）；n[5,50] 滑块；α[0.01,0.20] 滑块；左分布右尾=α（红色），右分布左尾=β（橙色）；显示功效=1-β；额外显示「若 n 翻倍，α不变时 β 变化」的对比按钮。",
      },
    ],
  },
];

// ─── 渲染合同（所有笔记智能体都必须遵守） ─────────────────────────────
const RENDER_CONTRACT = `公式一律用 KaTeX 语法：行内 $...$，独立公式 $$...$$，多行对齐用 $$\\begin{aligned}...\\end{aligned}$$；禁止 \\( \\)、\\[ \\]。
富文本块用自定义指令（整段独占，以 ::: 开始，以单独一行 ::: 结束）：
  :::definition{label=…}  :::theorem{label=…}  :::example{label=…}
  :::insight{label=…}     :::pitfall{label=…}   :::note{label=…}
  :::derivation{label=…}（折叠推导）
内嵌资源各占一行：::video{id=…}  ::interactive{id=…}`;

// ─── 提示词生成函数 ──────────────────────────────────────────────────
function notePrompt(item) {
  const { ch, sec } = item;
  const transcriptLines = ch.transcripts.length
    ? `可用课堂逐字稿（仅用于了解老师强调的重点/例子，笔记主体按标准教材撰写）：\n${ch.transcripts.map(t => `- Read ${ROOT}/docs/${t}`).join("\n")}`
    : "（本章无逐字稿，按标准教材和 SOP 完整撰写）";

  return `你是《概率论与数理统计》课程资深讲师与教辅作者。请为第${ch.id.replace("ch", "")}章「${ch.title}」的小节 ${sec.id}「${sec.title}」撰写一篇极其详细、通俗易懂、原创的学习讲义。

目标文件（用 Write 工具写入）：${ROOT}/content/chapters/${ch.id}/${sec.id}.md

本节主题：${sec.summary}

【动手前务必】
1. Read 黄金范例 ${ROOT}/content/chapters/ch01/1.1.md，严格对齐其风格、深度与指令块用法（向它看齐或超越）。
2. Read ${ROOT}/docs/sop/02-detail-generation.md 的 §2「笔记写作合同」。
3. ${transcriptLines}

【渲染契约（务必遵守）】
${RENDER_CONTRACT}

【写作要求（铁律：宁详尽勿潦草）】
- 读者：刚学完微积分与线代、怕公式的初学者
- 结构：## 直觉/动机（生活化切入）→ 定义(:::definition) → 为什么这样(:::insight) → 性质/定理(:::theorem，复杂推导放:::derivation) → 2-4个由浅入深例题(:::example，含完整解答与每步解释) → 易错点(:::pitfall) → 小结(:::note)并衔接下一节
- 在与正文叙述最贴切处各插入一行：::video{id=${sec.videoId}} 与 ::interactive{id=${sec.interactiveId}}
- 正文不少于 2000 字（复杂节 3000+），全简体中文，不要出现 AI 相关字样

【完成后】只用 Write 写该 .md 文件，不要运行 build/dev，不要改其它文件。
返回结构化结果：{ sectionId, ok: true, chars: 文件字符数, summary: "一句话描述本节核心内容" }`;
}

function interactivePrompt(item) {
  const { ch, sec } = item;
  return `你是资深前端工程师兼数据可视化专家。请创建一个真正可交互的教学可视化 React 组件。

目标文件（用 Write 工具写入）：${ROOT}/${sec.componentFile}

用途：第${ch.id.replace("ch", "")}章「${ch.title}」小节 ${sec.id}「${sec.title}」
组件 ID：${sec.interactiveId}，组件名：${sec.componentName}

【动手前务必】
1. Read ${ROOT}/docs/sop/02-detail-generation.md 的 §3「交互组件合同」
2. Read 参考样板：${ROOT}/components/interactives/ch01/FrequencyConvergence.tsx 和 ${ROOT}/components/interactives/ch01/BayesExplorer.tsx

【主题与概念】${sec.interactiveConcept}

【实现建议】${sec.interactiveIdeas}

【硬约束】
- 文件首行 "use client";，默认导出名为 ${sec.componentName} 的无 props React 组件
- 自包含：不发网络请求，不读外部数据；状态全用 useState；随机性仅在事件处理函数内用 Math.random()
- 仅依赖已安装库：react、framer-motion（可选）、clsx（可选）+ 内联 SVG/canvas
- 设计令牌：主色 var(--accent)，文字 var(--ink)/var(--ink-soft)，描边 var(--line)，底 var(--bg-muted)
- 外层套 className="rounded-xl border border-[var(--line)] bg-white p-4"
- TypeScript strict 通过：完整类型注解，无未使用变量，无 any
- 必须真可交互：按钮/滑块/拖拽/点击，实时数值反馈，揭示本节知识本质

【完成后】只用 Write 写该 .tsx，不改 registry.ts，不运行 build。
返回：{ id: "${sec.interactiveId}", sectionId: "${sec.id}", componentName: "${sec.componentName}", file: "${sec.componentFile}", title: "${sec.interactiveTitle}", description: "一句话", ok: true }`;
}

function manimPrompt(item) {
  const { ch, sec } = item;
  return `你是 Manim CE 动画作者。请创建一个教学动画场景文件。

目标文件（用 Write 工具写入）：${ROOT}/${sec.videoFile}

用途：第${ch.id.replace("ch", "")}章「${ch.title}」小节 ${sec.id}「${sec.title}」
视频 ID：${sec.videoId}，场景类：${sec.videoScene}

【动手前务必】
1. Read ${ROOT}/docs/sop/02-detail-generation.md 的 §4「Manim 动画合同」
2. Read 参考样板：${ROOT}/manim/chapters/ch01/scene_1_1_sample_space.py

【主题与概念】${sec.videoConcept}

【实现建议】${sec.videoIdeas}

【铁律约束】
- 中文文字：Text("...", font="Microsoft YaHei")；公式：MathTex(r"...")
- MathTex 内绝对不能含中文或全角标点（：，（）等），违反此规则动画无法渲染！
- 时长 25-60 秒，循序渐进，有重点高亮；单幕不堆满屏幕
- 文件顶层导出 REGISTER 列表（格式见 SOP §4）
- 只 import 确实存在的 manim 符号（不要 import Complement、ComplexPlane 等不常见符号，不确定时用 FunctionGraph、NumberPlane、Axes 等标准符号）

文件顶层必须包含：
REGISTER = [{{
  "scene": "${sec.videoScene}",
  "id": "${sec.videoId}",
  "chapterId": "${ch.id}",
  "sectionId": "${sec.id}",
  "title": "${sec.videoTitle}",
  "description": "一句话说明动画讲了什么",
}}]

【完成后】只用 Write 写该 .py，不要运行渲染命令。
返回：{{ id: "${sec.videoId}", sectionId: "${sec.id}", scene: "${sec.videoScene}", file: "${sec.videoFile}", title: "${sec.videoTitle}", ok: true }}`;
}

// ─── Schema ─────────────────────────────────────────────────────────
const noteSchema = {
  type: "object",
  properties: {
    sectionId: { type: "string" },
    ok: { type: "boolean" },
    chars: { type: "number" },
    summary: { type: "string" },
  },
  required: ["sectionId", "ok"],
};

const interactiveSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    sectionId: { type: "string" },
    componentName: { type: "string" },
    file: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    ok: { type: "boolean" },
  },
  required: ["id", "sectionId", "componentName", "file", "ok"],
};

const manimSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    sectionId: { type: "string" },
    scene: { type: "string" },
    file: { type: "string" },
    title: { type: "string" },
    ok: { type: "boolean" },
  },
  required: ["id", "sectionId", "scene", "file", "ok"],
};

// ─── 展平所有小节 ────────────────────────────────────────────────────
const ALL = [];
for (const ch of CHAPTERS) {
  for (const sec of ch.sections) {
    ALL.push({ ch, sec });
  }
}

log(`开始为 ${CHAPTERS.length} 章 ${ALL.length} 节生成三件套内容...`);

// ─── 主 Pipeline：笔记 → 交互+动画（节内并行，节间流水线）──────────
const pipeResults = await pipeline(
  ALL,
  (item) =>
    agent(notePrompt(item), {
      label: `笔记 ${item.ch.id}-${item.sec.id} ${item.sec.title}`,
      phase: "笔记",
      model: "sonnet",
      schema: noteSchema,
    }),
  (_, item) =>
    parallel([
      () =>
        agent(interactivePrompt(item), {
          label: `交互 ${item.ch.id}-${item.sec.id} ${item.sec.componentName}`,
          phase: "交互与动画",
          model: "sonnet",
          schema: interactiveSchema,
        }),
      () =>
        agent(manimPrompt(item), {
          label: `动画 ${item.ch.id}-${item.sec.id} ${item.sec.videoScene}`,
          phase: "交互与动画",
          model: "sonnet",
          schema: manimSchema,
        }),
    ])
);

const successNotes = pipeResults.filter(Boolean).length;
log(`内容生成完成（${successNotes}/${ALL.length} 节成功）。开始集成...`);

// ─── 集成 Phase ──────────────────────────────────────────────────────
phase("集成");

// 构建传递给集成智能体的数据
const chapterIntegrationData = CHAPTERS.map((ch) => ({
  id: ch.id,
  title: ch.title,
  summary: ch.summary,
  sections: ch.sections.map((sec) => ({
    id: sec.id,
    title: sec.title,
    summary: sec.summary,
    videoId: sec.videoId,
    interactiveId: sec.interactiveId,
  })),
}));

const registryData = ALL.map((item) => ({
  id: item.sec.interactiveId,
  chapterId: item.ch.id,
  sectionId: item.sec.id,
  title: item.sec.interactiveTitle,
  description: item.sec.interactiveConcept.slice(0, 80),
  componentName: item.sec.componentName,
  importPath: item.sec.componentFile
    .replace("components/interactives/", "./")
    .replace(".tsx", ""),
}));

await agent(
  `你需要更新两个 TypeScript 文件，把新生成的 ch02-ch08 内容集成进应用。

## 任务 1：更新 manifest.ts

Read 文件：${ROOT}/content/manifest.ts

对 ch02-ch08 每一章，把其 sections: [] 替换为完整的 sections 数组。数据如下：
${JSON.stringify(chapterIntegrationData, null, 2)}

每个 section 对象格式（TypeScript）：
{ id: "X.Y", title: "...", summary: "...", status: "done" as const, videoIds: ["videoId"], interactiveIds: ["interactiveId"] }

操作要求：
- 用 Edit 工具精确替换每章的 sections: [], 片段（不要修改 ch01 或其他部分）
- 逐章替换（每次 Edit 操作一章），不要一次性重写整个文件
- 替换后文件必须 TypeScript 语法正确

## 任务 2：更新 registry.ts

Read 文件：${ROOT}/components/interactives/registry.ts

在 interactives 数组末尾（最后一个 } 之后，数组闭合 ] 之前）追加以下条目：
${registryData
  .map(
    (r) => `  {
    id: "${r.id}",
    chapterId: "${r.chapterId}",
    sectionId: "${r.sectionId}",
    title: "${r.title}",
    description: "${r.description}",
    Component: dynamic(() => import("${r.importPath}"), { ssr: false }),
  },`
  )
  .join("\n")}

操作要求：
- 在文件末尾的 ]; 之前用 Edit 追加上面所有条目
- 不要修改文件中已有的 ch01 条目
- 保持 TypeScript 语法正确

完成两个文件更新后返回简短确认。`,
  {
    label: "集成 manifest+registry",
    phase: "集成",
    model: "sonnet",
  }
);

// ─── 渲染 Manim 动画（各章并行）────────────────────────────────────
log("开始并行渲染各章 Manim 动画...");

const renderResults = await parallel(
  CHAPTERS.map((ch) => () =>
    agent(
      `请用 PowerShell 工具渲染 ${ch.id}「${ch.title}」的所有 Manim 动画。

执行以下 PowerShell 命令（注意：$env:PATH 赋值必须在同一作用域内）：

$env:PATH = "C:\\Users\\AIMFl\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64;" + $env:PATH
Set-Location "D:\\new_project\\Gailvlun"
python manim/render.py --chapter ${ch.id}

**如果遇到渲染失败的场景**（看到 [error] 渲染失败）：
1. Read 失败的 .py 文件（路径在 [error] 上方的 $ 命令里）
2. 检查 MathTex(r"...") 内是否含中文或全角标点（如：，（）【】），若有必须改为 Text(font="Microsoft YaHei") 或纯 ASCII
3. 检查是否 import 了不存在的 manim 符号（如 Complement、ComplexNumber 等），若有则删除
4. 用 Edit 工具修复 .py 文件
5. 重新运行带 --force 的命令：
   python manim/render.py --chapter ${ch.id} --force

渲染完成后报告：成功 N 个视频、失败 M 个（列出失败的 scene 名称和原因）。`,
      {
        label: `渲染 ${ch.id}`,
        phase: "集成",
        model: "sonnet",
      }
    )
  )
);

// ─── 最终：更新 media.generated.ts（全量扫描）──────────────────────
await agent(
  `请用 PowerShell 工具执行以下命令，全量扫描所有章节视频并更新 content/media.generated.ts：

$env:PATH = "C:\\Users\\AIMFl\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64;" + $env:PATH
Set-Location "D:\\new_project\\Gailvlun"
python manim/render.py

（不带 --chapter 参数，扫描 public/media/videos/ 下所有已存在的 mp4，重写 content/media.generated.ts）

完成后输出 media.generated.ts 的视频条目数量。`,
  {
    label: "更新 media.generated.ts",
    phase: "集成",
    model: "sonnet",
  }
);

log("所有章节生成与集成完毕！");

return {
  chaptersGenerated: CHAPTERS.length,
  sectionsTotal: ALL.length,
  contentPipelineResults: pipeResults.filter(Boolean).length,
  renderResults: renderResults.filter(Boolean).length,
};
