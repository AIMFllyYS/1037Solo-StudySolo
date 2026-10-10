import type { ContentItem } from "@/lib/types/content";

export const foundationsItems: ContentItem[] = [
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
];
