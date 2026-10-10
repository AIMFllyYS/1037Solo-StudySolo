import type { ContentItem } from "@/lib/types/content";

export const functionalGroupsItems: ContentItem[] = [
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
];
