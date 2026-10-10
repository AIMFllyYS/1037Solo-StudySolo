import type { ContentItem } from '@/lib/types/content';

/**
 * 中国近现代史纲要 · 教材分类内容
 * 2023 年版教材，按章组织（每章内部拆分为多个 Markdown 小节）。
 *
 * 命名规范：所有 id 使用 `tb-` 前缀（textbook 缩写），与 detail 分类的 `1.1` 风格区分。
 * 文件路径：content/modern-history/textbook/{itemId}.md
 */
export const modernHistoryTextbookItems: ContentItem[] = [
  {
    id: 'tb-toc',
    title: '目录',
    type: 'document',
    status: 'done',
    summary: '2023 年版《中国近现代史纲要》教材总目录，共 10 章 + 导言，38 小节。',
  },
  {
    id: 'tb-ch00',
    title: '导言',
    type: 'section',
    status: 'done',
    summary: '中国近现代史综述、学习目的与要求。',
    children: [
      { id: 'tb-ch00-1', title: '一、中国近代史综述', type: 'document', status: 'done' },
      { id: 'tb-ch00-2', title: '二、中国现代史综述', type: 'document', status: 'done' },
      { id: 'tb-ch00-3', title: '三、学习中国近现代史的目的和要求', type: 'document', status: 'done' },
    ],
  },
  {
    id: 'tb-ch01',
    title: '第一章 进入近代后中华民族的磨难与抗争',
    type: 'section',
    status: 'done',
    summary: '鸦片战争前后的中国与世界、西方列强对中国的侵略、反抗外国武装侵略的斗争、反侵略战争的失败与民族意识的觉醒。',
    children: [
      { id: 'tb-ch01-1', title: '（一）鸦片战争前后的中国与世界', type: 'document', status: 'done' },
      { id: 'tb-ch01-2', title: '（二）西方列强对中国的侵略', type: 'document', status: 'done' },
      { id: 'tb-ch01-3', title: '（三）反抗外国武装侵略的斗争', type: 'document', status: 'done' },
      { id: 'tb-ch01-4', title: '（四）反侵略战争的失败与民族意识的觉醒', type: 'document', status: 'done' },
    ],
  },
  {
    id: 'tb-ch02',
    title: '第二章 不同社会力量对国家出路的早期探索',
    type: 'section',
    status: 'done',
    summary: '太平天国运动的起落、洋务运动的兴衰、维新运动的兴起和夭折。',
    children: [
      { id: 'tb-ch02-1', title: '（一）太平天国运动的起落', type: 'document', status: 'done' },
      { id: 'tb-ch02-2', title: '（二）洋务运动的兴衰', type: 'document', status: 'done' },
      { id: 'tb-ch02-3', title: '（三）维新运动的兴起和夭折', type: 'document', status: 'done' },
    ],
  },
  {
    id: 'tb-ch03',
    title: '第三章 辛亥革命与君主专制制度的终结',
    type: 'section',
    status: 'done',
    summary: '举起近代民族民主革命的旗帜、辛亥革命与中华民国的建立、北洋军阀统治与旧民主主义革命的失败。',
    children: [
      { id: 'tb-ch03-1', title: '（一）举起近代民族民主革命的旗帜', type: 'document', status: 'done' },
      { id: 'tb-ch03-2', title: '（二）辛亥革命与中华民国的建立', type: 'document', status: 'done' },
      { id: 'tb-ch03-3', title: '（三）北洋军阀统治与旧民主主义革命的失败', type: 'document', status: 'done' },
    ],
  },
  {
    id: 'tb-ch04',
    title: '第四章 中国共产党的成立和中国革命新局面',
    type: 'section',
    status: 'done',
    summary: '新文化运动和五四运动、马克思主义广泛传播与中国共产党诞生、中国革命的新局面。',
    children: [
      { id: 'tb-ch04-1', title: '（一）新文化运动和五四运动', type: 'document', status: 'done' },
      { id: 'tb-ch04-2', title: '（二）马克思主义广泛传播与中国共产党诞生', type: 'document', status: 'done' },
      { id: 'tb-ch04-3', title: '（三）中国革命的新局面', type: 'document', status: 'done' },
    ],
  },
  {
    id: 'tb-ch05',
    title: '第五章 中国革命的新道路',
    type: 'section',
    status: 'done',
    summary: '中国共产党对革命新道路的探索、中国革命在曲折中前进。',
    children: [
      { id: 'tb-ch05-1', title: '（一）中国共产党对革命新道路的探索', type: 'document', status: 'done' },
      { id: 'tb-ch05-2', title: '（二）中国革命在曲折中前进', type: 'document', status: 'done' },
    ],
  },
  {
    id: 'tb-ch06',
    title: '第六章 中华民族的抗日战争',
    type: 'section',
    status: 'done',
    summary: '日本发动企图灭亡中国的侵略战争、中国人民奋起抗击日本侵略者、抗日战争的正面战场、抗日战争的中流砥柱、抗日战争的胜利及其意义。',
    children: [
      { id: 'tb-ch06-1', title: '（一）日本发动企图灭亡中国的侵略战争', type: 'document', status: 'done' },
      { id: 'tb-ch06-2', title: '（二）中国人民奋起抗击日本侵略者', type: 'document', status: 'done' },
      { id: 'tb-ch06-3', title: '（三）抗日战争的正面战场', type: 'document', status: 'done' },
      { id: 'tb-ch06-4', title: '（四）抗日战争的中流砥柱', type: 'document', status: 'done' },
      { id: 'tb-ch06-5', title: '（五）抗日战争的胜利及其意义', type: 'document', status: 'done' },
    ],
  },
  {
    id: 'tb-ch07',
    title: '第七章 为建立新中国而奋斗',
    type: 'section',
    status: 'done',
    summary: '从争取和平民主到击退国民党的军事进攻、全国解放战争的发展和第二条战线的形成、中国共产党与民主党派的团结合作、建立人民民主专政的新中国。',
    children: [
      { id: 'tb-ch07-1', title: '（一）从争取和平民主到击退国民党的军事进攻', type: 'document', status: 'done' },
      { id: 'tb-ch07-2', title: '（二）全国解放战争的发展和第二条战线的形成', type: 'document', status: 'done' },
      { id: 'tb-ch07-3', title: '（三）中国共产党与民主党派的团结合作', type: 'document', status: 'done' },
      { id: 'tb-ch07-4', title: '（四）建立人民民主专政的新中国', type: 'document', status: 'done' },
    ],
  },
  {
    id: 'tb-ch08',
    title: '第八章 中华人民共和国的成立与中国社会主义建设道路的探索',
    type: 'section',
    status: 'done',
    summary: '中华人民共和国的成立和新生人民政权的巩固、党在过渡时期的总路线及其实施、初步确立社会主义基本制度、全面建设社会主义的良好开端、社会主义道路的艰辛探索和曲折发展。',
    children: [
      { id: 'tb-ch08-1', title: '（一）中华人民共和国的成立和新生人民政权的巩固', type: 'document', status: 'done' },
      { id: 'tb-ch08-2', title: '（二）党在过渡时期的总路线及其实施', type: 'document', status: 'done' },
      { id: 'tb-ch08-3', title: '（三）初步确立社会主义基本制度', type: 'document', status: 'done' },
      { id: 'tb-ch08-4', title: '（四）全面建设社会主义的良好开端', type: 'document', status: 'done' },
      { id: 'tb-ch08-5', title: '（五）社会主义道路的艰辛探索和曲折发展', type: 'document', status: 'done' },
    ],
  },
  {
    id: 'tb-ch09',
    title: '第九章 改革开放与中国特色社会主义的开创和发展',
    type: 'section',
    status: 'done',
    summary: '历史性的伟大转折和改革开放的起步、改革开放和社会主义现代化建设新局面、把中国特色社会主义推向 21 世纪、在新形势下坚持和发展中国特色社会主义。',
    children: [
      { id: 'tb-ch09-1', title: '（一）历史性的伟大转折和改革开放的起步', type: 'document', status: 'done' },
      { id: 'tb-ch09-2', title: '（二）改革开放和社会主义现代化建设新局面', type: 'document', status: 'done' },
      { id: 'tb-ch09-3', title: '（三）把中国特色社会主义推向 21 世纪', type: 'document', status: 'done' },
      { id: 'tb-ch09-4', title: '（四）在新形势下坚持和发展中国特色社会主义', type: 'document', status: 'done' },
    ],
  },
  {
    id: 'tb-ch10',
    title: '第十章 中国特色社会主义进入新时代',
    type: 'section',
    status: 'done',
    summary: '开拓中国特色社会主义更为广阔的发展前景、把新时代中国特色社会主义不断推向前进。',
    children: [
      { id: 'tb-ch10-1', title: '（一）开拓中国特色社会主义更为广阔的发展前景', type: 'document', status: 'done' },
      { id: 'tb-ch10-2', title: '（二）把新时代中国特色社会主义不断推向前进', type: 'document', status: 'done' },
    ],
  },
  {
    id: 'tb-epilogue',
    title: '后记与结语',
    type: 'document',
    status: 'done',
    summary: '教材后记、学习建议与致谢。',
  },
];
