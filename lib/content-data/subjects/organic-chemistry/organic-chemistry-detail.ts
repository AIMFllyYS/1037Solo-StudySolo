import type { ContentItem } from '@/lib/types/content';

/**
 * 有机化学 · 详解分类内容
 * 14 章完整数据，每章含 sections、summary。
 * 基于 20 次课堂逐字稿（第1-17、19、21、25讲；缺18/20/22-24讲）triage 后，
 * 按标准有机化学教材序（官能团/反应类型）重组。
 *
 * status 说明：详解 .md 文件写入前为 'stub'，Phase 4 写入后逐节翻 'done'。
 * videoIds / interactiveIds 在 Phase 6/7 由主控回填。
 */
export const organicChemistryDetailItems: ContentItem[] = [
  {
    id: 'ch01',
    title: '绪论与有机化学基础',
    type: 'section',
    status: 'done',
    summary:
      '有机化学的研究对象、学科价值与发展史；共价键与分子结构基础；键的断裂、碳中间体、酸碱理论与共振。',
    children: [
      {
        id: '1.1',
        title: '有机化学的研究对象与价值·发展史',
        type: 'section',
        status: 'done',
        summary:
          '有机化学的定义与学科地位；衣食住行与生命现象中的有机分子（多巴胺、青蒿素等）；认识与创造两大任务；从生命力论到魏勒合成尿素的发展史；有机化合物的数量与特征。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '1.2',
        title: '共价键与分子结构基础',
        type: 'section',
        status: 'done',
        summary:
          '共价键的成键方式与杂化轨道（sp³/sp²/sp）；化学键的四个参数（键长、键角、键能、极性）；电负性与键的极性；分子极性与分子结构的关系。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '1.3',
        title: '酸碱理论与有机反应基础',
        type: 'section',
        status: 'done',
        summary:
          '共价键的均裂与异裂；碳正离子、碳负离子、自由基中间体及其杂化；官能团分类总览；质子酸碱理论（共轭酸碱、水的两性）；路易斯酸碱理论；共振论与极限式。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch02',
    title: '有机化合物的命名',
    type: 'section',
    status: 'done',
    summary: '普通命名法与系统命名法；顺序规则；烷烃、烯炔、环烃及各类官能团化合物的命名。',
    children: [
      {
        id: '2.1',
        title: '烷基与官能团·普通命名法',
        type: 'section',
        status: 'done',
        summary:
          '三种命名方式（普通/系统/俗名）；常见烷基（正异仲叔新）、烯基炔基芳基；含卤/氧/氮/硫基团的名称；普通命名法的适用范围。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '2.2',
        title: '系统命名法与顺序规则',
        type: 'section',
        status: 'done',
        summary:
          '最长主链选择与编号原则；顺序规则（原子序数、有大则大、不饱和键的虚拟补齐）；链式烷烃命名；桥环与螺环命名；环烷烃顺反命名。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '2.3',
        title: '烯炔环烃及各类化合物的命名',
        type: 'section',
        status: 'done',
        summary:
          '烯烃炔烃主链与编号；Z/E 命名法与中文顺反；官能团优先级顺序（羧酸>酯>醛>酮>醇>胺…）；醇醛酮羧酸胺的命名；多官能团取舍与俗名举例。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch03',
    title: '分子结构与分子间作用力',
    type: 'section',
    status: 'done',
    summary: '范德华力、氢键、疏水作用与超分子组装；分子间作用力对物理性质的影响。',
    children: [
      {
        id: '3.1',
        title: '范德华力与氢键',
        type: 'section',
        status: 'done',
        summary:
          '范德华力三组成（色散力、诱导力、取向力）及静电本质；氢键 X-H···Y 的定义、键能、方向性与饱和性；分子内氢键 vs 分子间氢键（邻/对硝基苯酚）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '3.2',
        title: '疏水作用与超分子组装',
        type: 'section',
        status: 'done',
        summary:
          '疏水作用与双亲分子；表面活性剂（SDS）的结构与去污原理；胶束的自发组装与微反应器应用；超分子化学（环糊精主客体）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '3.3',
        title: '分子间作用力与物理性质',
        type: 'section',
        status: 'done',
        summary:
          '沸点规律（烷烃同系列与支链、顺反异构、醇/醚/酸的氢键、羧酸二聚体、胺）；熔点与分子对称性（奇偶碳效应）；弱相互作用解释物性的适用边界。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch04',
    title: '烷烃与环烷烃',
    type: 'section',
    status: 'done',
    summary: '烷烃的结构与构造/构型/构象；环烷烃构象分析；自由基取代反应与环烷烃开环。',
    children: [
      {
        id: '4.1',
        title: '烷烃的结构与构造/构型/构象',
        type: 'section',
        status: 'done',
        summary:
          '烷烃定义、分类与通式；构造异构（伯仲叔季碳、一二三级氢）；sp³ 杂化与 σ 键旋转；构造/构型/构象三概念；乙烷与丁烷的构象分析与纽曼投影式；优势构象。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '4.2',
        title: '环烷烃的构象分析',
        type: 'section',
        status: 'done',
        summary:
          '环己烷椅式构象（a 键/e 键）；取代基的优势构象判断；单/多取代环己烷（邻/间/对位顺反式）的稳定性；椅式翻转与半椅半船扭船；十氢萘的顺反异构。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '4.3',
        title: '烷烃的自由基取代与环烷烃开环',
        type: 'section',
        status: 'done',
        summary:
          '自由基取代机理（链引发/链增长/链终止）；不同位置氢的活性（三级>二级>一级）；氯与溴的选择性差异；σ-p 超共轭与碳自由基稳定性；小环张力与开环加成（环丙烷加 H₂/Br₂/HBr/H₂O）；拜尔张力学说评价。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch05',
    title: '电子效应',
    type: 'section',
    status: 'done',
    summary: '诱导效应、共轭效应、超共轭效应及其对酸碱性与碳中间体稳定性的影响。',
    children: [
      {
        id: '5.1',
        title: '诱导效应',
        type: 'section',
        status: 'done',
        summary:
          '诱导效应沿 σ 键传递、随距离衰减（三个键以内）；吸电子/给电子基的判断标准（以 H 为基准）；诱导效应对酸性的影响（氯代乙酸 pKa）；常见基团的吸/给电子排序。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '5.2',
        title: '共轭效应',
        type: 'section',
        status: 'done',
        summary:
          'π-π、p-π 共轭与电子离域；吸电子共轭（醛基/硝基/羰基）与给电子共轭（氨基/烷氧基/卤素孤对）；邻对位与间位的共轭差异；诱导与共轭的叠加判断（苯酚 vs 甲醇酸性）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '5.3',
        title: '超共轭与碳中间体稳定性',
        type: 'section',
        status: 'done',
        summary:
          'σ-π 超共轭（丙酮 α-氢）与 σ-p 超共轭（碳自由基/碳正离子）；碳正离子、碳自由基稳定性顺序（三级>二级>一级）；碳负离子的相反规律（吸电子基稳定）；动态诱导极化与立体效应。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch06',
    title: '烯烃',
    type: 'section',
    status: 'done',
    summary: '烯烃的结构与催化加氢；亲电加成与马氏规则；自由基加成与氧化反应。',
    children: [
      {
        id: '6.1',
        title: '烯烃的结构与催化加氢',
        type: 'section',
        status: 'done',
        summary:
          'π 键与 σ 键的成键与键能、旋转受限；顺反异构与 Z/E；催化加氢（Pt/Pd/Ni）的顺式加成机理与位阻对速率的影响。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '6.2',
        title: '亲电加成与马氏规则',
        type: 'section',
        status: 'done',
        summary:
          '亲电加成通式与碳正离子中间体（决速步/快速步）；马氏规则及其电子效应解释；吸电子基下的规则反转；碳正离子重排（甲基/氢迁移）；卤化（环鎓离子反式加成）；水合；硼氢化（四元环过渡态、反马氏、顺式加成）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '6.3',
        title: '自由基加成与氧化反应',
        type: 'section',
        status: 'done',
        summary:
          '过氧化物引发的自由基加成（反马氏）与亲电加成的互补；KMnO₄ 弱/强氧化（顺式邻二醇/断键成酸）；臭氧化（断键成醛酮、结构鉴定）；环氧化；聚合反应。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch07',
    title: '炔烃与共轭二烯烃',
    type: 'section',
    status: 'done',
    summary: '炔烃的结构、酸性与加成；炔烃的氧化与有机金属衍生物；共轭二烯与 Diels-Alder 反应。',
    children: [
      {
        id: '7.1',
        title: '炔烃的结构、酸性与加成',
        type: 'section',
        status: 'done',
        summary:
          '三键结构与不饱和度；端炔 C-H 酸性（pKa~25）与金属炔化物（银氨/亚铜鉴定）；催化加氢的选择性（林德拉→顺式，Na/NH₃→反式）；亲电加成（加卤素/HX 马氏、加水经烯醇式互变成醛酮）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '7.2',
        title: '炔烃的氧化与有机金属衍生物',
        type: 'section',
        status: 'done',
        summary:
          '炔烃硼氢化；亲核加成；KMnO₄/臭氧化氧化断键；有机金属试剂（炔基钠/锂、格氏试剂、烷基锂）的结构与碳碳键构筑。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '7.3',
        title: '共轭二烯烃与 Diels-Alder 反应',
        type: 'section',
        status: 'done',
        summary:
          '共轭二烯的键长平均化与离域；1,2-加成 vs 1,4-加成（动力学/热力学产物）；Diels-Alder 环加成（双烯+亲双烯体）；温度对产物的影响。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch08',
    title: '芳香化合物',
    type: 'section',
    status: 'done',
    summary: '芳香性与休克尔规则；亲电取代与傅克反应；定位效应；稠环芳烃与氧化加成。',
    children: [
      {
        id: '8.1',
        title: '芳香性与休克尔规则',
        type: 'section',
        status: 'done',
        summary:
          '苯的结构与离域能；芳香性（易取代难加成、光谱特征）；休克尔规则三条件（共平面、闭环 π 共轭、4n+2）；环戊二烯负离子/环庚三烯正离子等的判断。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '8.2',
        title: '亲电取代与傅克反应',
        type: 'section',
        status: 'done',
        summary:
          '卤代/硝化/磺化的亲电试剂生成与机理；傅克烷基化（碳正离子重排）与酰基化（酰基正离子不重排）；多取代合成路线设计。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '8.3',
        title: '定位效应与多取代规则',
        type: 'section',
        status: 'done',
        summary:
          '邻对位定位基（致活）与间位定位基（致钝）的分类；卤素的特例（致钝但邻对位定向）；诱导+共轭对定位的影响；两取代基的竞争定位与位阻。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '8.4',
        title: '稠环芳烃与芳香烃的氧化加成',
        type: 'section',
        status: 'done',
        summary:
          '萘的 α/β 位与亲电取代选择性；磺化的动力学/热力学产物；芳香烃的催化加氢、侧链卤代与强氧化（邻苯二甲酸酐、醌）。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch09',
    title: '立体化学与手性',
    type: 'section',
    status: 'done',
    summary: '对称性与手性碳；对映/非对映/内消旋/外消旋；Fisher 投影式与 R/S 绝对构型。',
    children: [
      {
        id: '9.1',
        title: '对称性与手性、手性碳原子',
        type: 'section',
        status: 'done',
        summary:
          '对称中心/对称面；手性的本质（缺对称因素）与旋光性的区别；手性碳原子（四个不同取代基）的产生。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '9.2',
        title: '对映异构、非对映、内消旋与外消旋',
        type: 'section',
        status: 'done',
        summary:
          '含一个手性碳→对映异构体；含两个手性碳→对映/非对映；内消旋体（分子内对称面、纯净物无旋光）vs 外消旋体（等量混合物）；无手性碳但有手性的分子（联苯/丙二烯/螺环/手性氮硫）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '9.3',
        title: 'Fisher 投影式与 R/S 绝对构型',
        type: 'section',
        status: 'done',
        summary:
          'Fisher 投影三原则与旋转规则；顺序规则定优先级；R/S 判断步骤（排序→隐最小基→大中小转向）；从 Fisher 式到绝对构型；生物活性分子构型。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch10',
    title: '卤代烃',
    type: 'section',
    status: 'done',
    summary: '亲核取代 SN1/SN2；消除 E1/E2 与扎伊采夫规则；取代与消除的竞争、金属有机化合物。',
    children: [
      {
        id: '10.1',
        title: '亲核取代反应 SN1/SN2',
        type: 'section',
        status: 'done',
        summary:
          '亲核试剂与碳卤键极化；SN2（双分子、背面进攻、构型翻转、五价过渡态）；SN1（单分子、碳正离子、外消旋化、可重排）；底物/离去基团/亲核试剂/溶剂的影响；亲核性与碱性的辨析（可极化性）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '10.2',
        title: '消除反应 E1/E2 与扎伊采夫规则',
        type: 'section',
        status: 'done',
        summary:
          'β-消除；E1（碳正离子分步）与 E2（双分子协同、反式消除立体要求）；扎伊采夫规则与区域选择性；立体选择性（反式烯烃为主）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '10.3',
        title: '取代与消除的竞争·金属有机化合物',
        type: 'section',
        status: 'done',
        summary:
          '底物/试剂碱性/溶剂/温度对 SN 与 E 竞争的影响规律；格氏试剂与有机锂、二烷基铜锂的制备与碳碳键构筑；卤代烃的还原脱卤。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch11',
    title: '醇、酚、醚',
    type: 'section',
    status: 'done',
    summary: '醇的性质与反应；酚的结构与反应；醚、环氧乙烷与硫醇硫醚。',
    children: [
      {
        id: '11.1',
        title: '醇的性质与反应',
        type: 'section',
        status: 'done',
        summary:
          '醇的酸性（伯>仲>叔）；与氢卤酸的 SN1/SN2（卢卡斯试剂）、PCl₅/SOCl₂（构型保持）；磺酸酯活化；消除（扎伊采夫、重排）；酯化（与羧酸/酰氯/酸酐、无机酸酯）；氧化（柯林斯/琼斯试剂、邻二醇断键与重排）；制备方法。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '11.2',
        title: '酚的结构与反应',
        type: 'section',
        status: 'done',
        summary:
          '酚羟基 sp² 与共轭；取代基对酸性的影响（诱导/共轭、邻间对位）；酚醚化与酯化（弗利斯重排）；苯环亲电取代（三溴苯酚、磺化硝化）；酚的氧化（醌）与三氯化铁显色。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '11.3',
        title: '醚·环氧乙烷·硫醇硫醚',
        type: 'section',
        status: 'done',
        summary:
          '醚的稳定性与威廉森合成；环氧乙烷开环（酸催化进攻位阻大碳 vs 碱催化进攻位阻小碳）；磷霉素应用；硫醇/硫酚/硫醚的酸性、二硫键（烫发）与氧化。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch12',
    title: '醛和酮',
    type: 'section',
    status: 'done',
    summary: '羰基的亲核加成；金属有机试剂与 Wittig 反应；醛酮的氧化还原与羟醛缩合。',
    children: [
      {
        id: '12.1',
        title: '羰基的亲核加成',
        type: 'section',
        status: 'done',
        summary:
          '羰基结构与极化、α-氢活性；加 HCN（α-羟基腈）；加亚硫酸氢钠（鉴别）；加醇成半缩醛/缩醛（羰基保护）；加伯胺成亚胺（MOF/COF）、加仲胺成烯胺及其 α-烷基化应用。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '12.2',
        title: '金属有机试剂与 Wittig 反应',
        type: 'section',
        status: 'done',
        summary:
          '格氏试剂加醛→仲醇、加酮→叔醇、加环氧乙烷→伯醇（增碳）；炔基钠/锂；Wittig 反应（叶立德制备与四元环中间体→烯烃）及逆合成分析。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '12.3',
        title: '醛酮的氧化还原与羟醛缩合',
        type: 'section',
        status: 'done',
        summary:
          '催化加氢、NaBH₄/LiAlH₄、克莱门森/黄鸣龙还原；醛的银镜/铜镜与高锰酸钾氧化、拜耳-维利格氧化；羟醛缩合（脱水成 α,β-不饱和醛酮、交叉缩合控制、康尼扎罗反应、分子内成环）。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch13',
    title: '羧酸及其衍生物',
    type: 'section',
    status: 'done',
    summary: '羧酸的酸性与化学性质；衍生物的活性序列与水解醇解氨解；格氏反应与克莱森缩合。',
    children: [
      {
        id: '13.1',
        title: '羧酸的酸性与化学性质',
        type: 'section',
        status: 'done',
        summary:
          '羧基共振与酸性；诱导效应对酸性的影响；酯化（酸催化亲核加成-消除、同位素标记、叔醇碳正离子路径）；与卤代烷成酯；脱水成酸酐（成环效应）；还原（LiAlH₄）；脱羧（β-吸电子基、汉斯狄克/柯奇反应）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '13.2',
        title: '羧酸衍生物的结构与反应活性序列',
        type: 'section',
        status: 'done',
        summary:
          '酰氯>酸酐>酯>酰胺的活性顺序与电子效应/离去能力；亲核加成-消除通用机理；水解、醇解（酯交换、阿司匹林）、氨解（成酰胺）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '13.3',
        title: '与格氏试剂的反应及克莱森缩合',
        type: 'section',
        status: 'done',
        summary:
          '酰氯低温→酮、常温→醇；酯+格氏→叔醇；酰胺的特殊性；克莱森缩合（酯 α-氢酸性、强碱催化→β-酮酯）。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch14',
    title: '含氮化合物与杂环',
    type: 'section',
    status: 'done',
    summary: '硝基苯还原与重氮盐、偶氮；胺的碱性与霍夫曼消除/降解；杂环与含氮天然产物。',
    children: [
      {
        id: '14.1',
        title: '硝基苯还原·重氮盐·偶氮化合物',
        type: 'section',
        status: 'done',
        summary:
          '硝基苯还原（铁/酸、硫化钠）成苯胺；苯胺与亚硝酸成重氮盐（低温）；重氮盐转化（桑德迈尔、席曼、次磷酸还原、偶联）；偶氮染料（甲基橙等）与光异构应用。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '14.2',
        title: '胺的碱性、鉴别与霍夫曼消除/降解',
        type: 'section',
        status: 'done',
        summary:
          '胺的碱性序列（甲胺>氨>吡啶>苯胺>吡咯）与电子效应；溴水/兴斯堡鉴别；季铵盐与季铵碱；霍夫曼消除（霍夫曼规则，与扎伊采夫相反）；霍夫曼降解（酰胺→少一碳伯胺）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '14.3',
        title: '杂环化合物与含氮天然产物',
        type: 'section',
        status: 'done',
        summary:
          '吡啶（氮孤对不共轭显碱性、亲电取代困难）；吡咯/呋喃/噻吩（杂原子共轭、亲电取代易在 α 位）；糖类变旋与还原性；氨基酸（两性离子）、肽键、蛋白质一级结构与副键。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch15',
    title: '含氮有机化合物',
    type: 'section',
    status: 'done',
    summary: '硝基化合物与胺的结构分类命名碱性；胺的烷基化酰化与亲电取代；重氮盐偶氮化合物与霍夫曼消除/降解。',
    children: [
      {
        id: 'ppt-15.1',
        title: '硝基化合物与胺类化合物',
        type: 'section',
        status: 'done',
        summary:
          '含氮有机化合物分类（腈、硝基化合物、胺、重氮/偶氮、酰胺、季铵盐/碱）；硝基化合物结构（sp² 杂化、两个 N-O 键等长、共振）与还原；胺的定义分类命名；胺的碱性三因素（电子效应、溶剂化、位阻）；脂肪胺与芳香胺碱性顺序。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: 'ppt-15.2',
        title: '胺的化学反应',
        type: 'section',
        status: 'done',
        summary:
          '胺的烷基化（SN2，得混合物）与酰化（伯/仲胺成酰胺、胺基保护）；兴斯堡反应鉴别伯仲叔胺（苯磺酰氯/NaOH，溶解性差异）；与亚硝酸的反应（脂肪伯胺放 N₂、芳香伯胺成重氮盐、仲胺黄色亚硝基胺、芳香叔胺芳环取代）；芳环亲电取代（氨基强活化，溴水直接三溴代，保护后单溴代；硝化条件与质子化定位）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: 'ppt-15.3',
        title: '重氮盐、偶氮化合物与霍夫曼反应',
        type: 'section',
        status: 'done',
        summary:
          '重氮盐结构（线性 sp 杂化，芳香族更稳定）与制备；重氮基取代（水解成酚、桑德迈尔成 Cl/Br/CN、希曼成 F、次磷酸脱氨基）；还原成苯肼；偶联反应（弱亲电试剂，酚在弱碱对位，胺在弱酸对位，形成偶氮化合物）；季铵盐与季铵碱；霍夫曼消除（季铵碱 E2，霍夫曼规则取烷基最少的烯烃）；霍夫曼降解（酰胺→少一碳伯胺，构型保持）。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch16',
    title: '芳香杂环化合物',
    type: 'section',
    status: 'done',
    summary: '五元杂环（吡咯、呋喃、噻吩）富电子芳香性与亲电取代；六元杂环（吡啶）缺电子与亲核取代；喹啉、异喹啉。',
    children: [
      {
        id: 'ppt-16.1',
        title: '五元杂环化合物',
        type: 'section',
        status: 'done',
        summary:
          '杂环化合物分类；吡咯/呋喃/噻吩的 sp² 结构与 6π 电子芳香性（4n+2 规则，杂原子孤对电子参与共轭）；吡咯型氮（无碱性，弱酸性）vs 吡啶型氮（显碱性）；亲电取代活性 吡咯>呋喃>噻吩>苯，主要在 α 位，需温和条件（避免强酸/氧化剂）；苯并五元杂环（吲哚 C-3，苯并呋喃 C-2，苯并噻吩 C-3）；加氢/Diels-Alder（呋喃）；糠醛。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: 'ppt-16.2',
        title: '六元杂环化合物',
        type: 'section',
        status: 'done',
        summary:
          '吡啶的 sp² 结构与 6π 电子芳香性，氮孤对电子不参与共轭显弱碱性（pKb=8.8），缺电子环；亲电取代在 β 位（3 位，避免正电荷在 N），需剧烈条件；亲核取代在 α 位（2 位，Chichibabin 反应）；N-氧化吡啶（γ 位亲电取代）；催化加氢成哌啶；喹啉（苯并吡啶，N 在 1 位）亲电取代苯环 5/8 位、亲核取代吡啶环 2 位；异喹啉（N 在 2 位）。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch17',
    title: '糖类与脂类化合物',
    type: 'section',
    status: 'done',
    summary: '单糖的开链/环式结构与变旋现象；单糖的化学性质与双糖；多糖（淀粉、纤维素）与脂类（油脂、甾族、萜类）。',
    children: [
      {
        id: 'ppt-17.1',
        title: '单糖的结构与变旋现象',
        type: 'section',
        status: 'done',
        summary:
          '糖类分类（单糖/二糖/多糖）；单糖的醛糖/酮糖与 D/L 构型（位号最大手性碳的 -OH 方向）；费歇尔投影式；变旋现象（α/β 型通过开链式互变达到平衡）；葡萄糖环化为六元环吡喃糖（C-5 羟基进攻 C-1，α 与 β 定义）；哈瓦斯透视式绘制规则；果糖五元环呋喃型结构。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: 'ppt-17.2',
        title: '单糖的化学性质与双糖',
        type: 'section',
        status: 'done',
        summary:
          '糖苷（成缩醛，碱稳定/酸或酶水解，无变旋）；氧化反应（弱氧化剂所有单糖均反应，溴水只氧化醛糖可鉴别，稀硝酸成糖二酸）；差向异构化（烯二醇中间体，酮糖→醛糖）；还原反应（NaBH₄ 成糖醇）；成脎（3 分子苯肼，葡萄糖/甘露糖/果糖得同一糖脎）；脱水成糠醛；显色反应（莫力许所有糖/西列凡诺夫酮糖/皮阿耳戊糖/狄斯克脱氧核糖）；双糖（麦芽糖 α-1,4/纤维二糖 β-1,4/乳糖 β-1,4 为还原糖，蔗糖 α,β-1,2 为非还原糖）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: 'ppt-17.3',
        title: '多糖与脂类化合物',
        type: 'section',
        status: 'done',
        summary:
          '多糖（均多糖/杂多糖；无变旋非还原糖）；淀粉（直链 α-1,4 遇碘蓝色，支链 α-1,6 遇碘紫色）；纤维素（β-1,4 苷键，人不能消化）；油脂（甘油三酯，油液态/脂固态，皂化/硬化）；皂化值/碘值/酸值三大指标；甾族化合物（环戊烷并氢化菲骨架，胆固醇/睾丸酮等）；萜类化合物（异戊二烯单位头尾相连，半萜/单萜/…/四萜）。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
  {
    id: 'ch18',
    title: '含氮天然化合物',
    type: 'section',
    status: 'done',
    summary: '氨基酸的两性结构与等电点；氨基酸的化学反应（范斯莱克、茚三酮、脱羧、脱水）；多肽的肽键平面性与一级结构测定；蛋白质的四级结构与性质。',
    children: [
      {
        id: 'ppt-18.1',
        title: '氨基酸的结构与性质',
        type: 'section',
        status: 'done',
        summary:
          'α-氨基酸结构（两性离子 H₃N⁺-CHR-COO⁻）；分类（脂肪族/芳香族/杂环，酸性/碱性/中性，必需氨基酸 8 种）；手性（除甘氨酸外均有手性碳，天然 L 型）；等电点（pI：中性 5-6.5，酸性 2.5-3.5，碱性 9-11，溶解度最小可电泳分离）；氨基的测定（范斯莱克 HNO₂ 放 N₂，丹酰氯荧光标记，Cbz/Boc 保护）；羧基的反应（脱羧成胺、茚三酮蓝紫色鉴别 α-氨基酸，β/γ 不反应，脯氨酸显黄色）；受热脱水（α-氨基酸 → 二酮吡嗪）；NO 信号分子。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: 'ppt-18.2',
        title: '多肽与蛋白质',
        type: 'section',
        status: 'done',
        summary:
          '肽键（-CO-NH-，p-π 共轭，C-N 键长 132 pm，不能自由旋转，刚性平面，反式稳定）；N-端/C-端；多肽一级结构测定（酸水解 + 色谱，Sanger DNFB 法/Edman 降解 N-端，羧肽酶 C-端，部分水解重叠推序）；蛋白质四级结构（一级：肽键；二级：氢键维持 α-螺旋/β-折叠；三级：侧链相互作用；四级：亚基非共价键缔合）；等电点与两性；胶体性质与沉淀（盐析可逆，变性不可逆）；颜色反应（茚三酮蓝紫色、双缩脲紫红色、黄蛋白反应黄色）。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
];


