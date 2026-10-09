const chunks = [];
const P = (o)=>chunks.push(o);
const split=(s,n)=>{const a=[];for(let i=0;i<s.length;i+=n)a.push(s.slice(i,i+n));return a};
P({type:'start', messageId:'m_demo'});
P({type:'start-step'});
P({type:'reasoning-start', id:'r1'});
for (const d of split('学生问的是临床现象，要从组胚的胰岛 B 细胞追到生化的脂肪动员、β-氧化和酮体生成，最后落到丙酮经肺呼出。先跨三本教材检索。',3)) P({type:'reasoning-delta', id:'r1', delta:d});
P({type:'reasoning-end', id:'r1'});
P({type:'tool-input-start', toolCallId:'c1', toolName:'searchNotes'});
P({type:'tool-input-available', toolCallId:'c1', toolName:'searchNotes', input:{query:'胰岛素不足 酮体 烂苹果味', scope:'class', crossYear:false}});
P({type:'tool-output-available', toolCallId:'c1', output:{text:'ok', hits:[
 {title:'组织学与胚胎学 · 第十五章 消化腺 · 胰岛', path:'histology/textbook/ch15-4', snippet:'B 细胞分泌胰岛素……胰岛素分泌不足可致血糖升高', kind:'class', subjectId:'histology', citeIndex:1},
 {title:'生物化学 · 第八章 第三节 甘油三酯代谢 · 酮体', path:'biochemistry/textbook/ch08-3', snippet:'丙酮经呼吸道，有“烂苹果气味”', kind:'class', subjectId:'biochemistry', citeIndex:2},
 {title:'生物化学 · 第七章 第六节 糖异生', path:'biochemistry/textbook/ch07-6', snippet:'长期饥饿时脑依赖酮体供能', kind:'class', subjectId:'biochemistry', citeIndex:3},
 {title:'系统解剖学 · 第二章 第二节 消化腺 · 胰', path:'anatomy/textbook/ch02-2', snippet:'胰位于腹后壁，分头、颈、体、尾', kind:'class', subjectId:'anatomy', citeIndex:4},
]}});
P({type:'finish-step'});
P({type:'start-step'});
P({type:'text-start', id:'t1'});
const answer = `一句话：**胰岛素缺了，脂肪被迫顶上来供能，肝把烧不完的乙酰 CoA 做成酮体，其中的丙酮从肺呼出——就是烂苹果味。** [1][2]

### 因果链（跨三本教材）

1. **组胚 · 胰岛**：B 细胞退化，胰岛素分泌不足，葡萄糖进不了细胞 [1]
2. **生化 · 脂肪动员**：脂解激素占上风，甘油三酯大量分解，脂肪酸涌入肝脏 [2]
3. **生化 · β-氧化**：乙酰 $\\mathrm{CoA}$ 暴增，但草酰乙酸不足，进不了三羧酸循环 [2][3]
4. **生化 · 酮体生成**：肝线粒体把它缩合成酮体

$$
2\\,\\text{乙酰CoA} \\xrightarrow{\\text{硫解酶}} \\text{乙酰乙酰CoA} \\xrightarrow{\\text{HMG-CoA 合酶/裂解酶}} \\text{乙酰乙酸} \\longrightarrow \\text{丙酮} \\uparrow
$$

5. **呼吸道**：丙酮挥发，随呼气排出 → **烂苹果味**；酮体超过肾阈值 → 酮尿 [2]

> 血酮体正常仅 $0.03\\sim0.5\\,\\mathrm{mmol/L}$，严重糖尿病可高出**数十倍**，导致酮症酸中毒 [2]。
`;
for (const seg of answer.split(/(\$\$[\s\S]*?\$\$)/)) { if (seg.startsWith('$$')) P({type:'text-delta', id:'t1', delta:seg}); else for (const d of split(seg, 4)) P({type:'text-delta', id:'t1', delta:d}); }
P({type:'text-end', id:'t1'});
P({type:'finish-step'});
P({type:'finish'});
P('DONE');
module.exports = chunks;
