import type { ContentItem } from "@/lib/types/content";

export const hydrocarbonsItems: ContentItem[] = [
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
];
