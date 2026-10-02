import katex from 'katex'
import 'katex/contrib/mhchem'
import {formulaProposalSchema,formulaPropsSchema,type FormulaProposal,type FormulaProps} from './schema'
export {formulaProposalSchema,formulaPropsSchema} from './schema'
export type {FormulaProposal,FormulaProps} from './schema'
const forbidden=/\\(?:href|url|includegraphics|htmlId|htmlClass|htmlStyle|htmlData|html|def|gdef|global)\b/u

type Fraction={n:bigint;d:bigint}
class CannotCheck extends Error {}
class InvalidArithmetic extends Error {}
function fraction(n:bigint,d:bigint):Fraction{
  if(d===0n)throw new InvalidArithmetic('除数为零')
  if(d<0n){n=-n;d=-d}
  let x=n<0n?-n:n,y=d
  while(y!==0n){const next=x%y;x=y;y=next}
  const gcd=x||1n,numerator=n/gcd,denominator=d/gcd
  if(numerator.toString().length>80||denominator.toString().length>80)throw new CannotCheck()
  return {n:numerator,d:denominator}
}
const plus=(a:Fraction,b:Fraction)=>fraction(a.n*b.d+b.n*a.d,a.d*b.d)
const minus=(a:Fraction,b:Fraction)=>fraction(a.n*b.d-b.n*a.d,a.d*b.d)
const times=(a:Fraction,b:Fraction)=>fraction(a.n*b.n,a.d*b.d)
const divide=(a:Fraction,b:Fraction)=>fraction(a.n*b.d,a.d*b.n)
function numericValue(text:string):Fraction{
  if(text.length>16)throw new CannotCheck()
  const places=text.split('.')[1]?.length??0
  return fraction(BigInt(text.replace('.','')),10n**BigInt(places))
}
function numericEquation(latex:string):{status:'checked'|'invalid'|'unchecked';detail:string}{
  try{
    let source=latex.replace(/\\left|\\right/g,'').replace(/\\(?:times|cdot)/g,'*').replace(/\\div/g,'/')
    for(let i=0;i<8&&source.includes('\\frac');i++){
      const replaced=source.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,'($1)/($2)')
      if(replaced===source)break;source=replaced
    }
    const parts=source.split('=')
    if(parts.length!==2||source.length>800||/[^0-9.()+*/^{}=\s-]/u.test(source))throw new CannotCheck()
    const parse=(expression:string):Fraction=>{
      const tokens=expression.match(/\d+(?:\.\d*)?|\.\d+|[()+*/^{}-]/g)
      if(!tokens||tokens.length>128||tokens.join('')!==expression.replace(/\s/g,''))throw new CannotCheck()
      let at=0
      const peek=()=>tokens[at]
      const take=()=>tokens[at++]
      function atom():Fraction{
        const token=take()
        if(token==='('||token==='{'){
          const value=add(),closing=take();if(closing!==(token==='('?')':'}'))throw new CannotCheck();return value
        }
        if(!token||!/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(token))throw new CannotCheck()
        return numericValue(token)
      }
      function power():Fraction{
        let value=atom()
        if(peek()==='^'){
          take();const exponent=unary();if(exponent.d!==1n||exponent.n>8n||exponent.n< -8n)throw new CannotCheck()
          const magnitude=exponent.n<0n?-exponent.n:exponent.n
          value=exponent.n<0n?fraction(value.d**magnitude,value.n**magnitude):fraction(value.n**magnitude,value.d**magnitude)
        }
        return value
      }
      function unary():Fraction{const sign=peek();if(sign==='+'||sign==='-'){take();const value=unary();return sign==='-'?fraction(-value.n,value.d):value}return power()}
      function mul():Fraction{let value=unary();while(peek()==='*'||peek()==='/'){const op=take(),next=unary();value=op==='*'?times(value,next):divide(value,next)}return value}
      function add():Fraction{let value=mul();while(peek()==='+'||peek()==='-'){const op=take(),next=mul();value=op==='+'?plus(value,next):minus(value,next)}return value}
      const result=add();if(at!==tokens.length)throw new CannotCheck();return result
    }
    const left=parse(parts[0]),right=parse(parts[1])
    const same=left.n===right.n&&left.d===right.d
    return same?{status:'checked',detail:'两侧有理数计算一致；不代表口述来源已核对'}:{status:'invalid',detail:'两侧数值计算不一致'}
  }catch(error){return error instanceof InvalidArithmetic?{status:'invalid',detail:error.message}:{status:'unchecked',detail:'该表达式超出当前数值检验范围，数学意义待核对'}}
}

function formulaHash(text:string,seed:bigint){
  let hash=seed
  for(const ch of text){hash^=BigInt(ch.codePointAt(0)!);hash=BigInt.asUintN(64,hash*1099511628211n)}
  return hash.toString(16).padStart(16,'0')
}
export function validateFormulaProposal(proposal:FormulaProposal,sourceText:string,sourceRevision:number):FormulaProps{
  const input=formulaProposalSchema.parse(proposal)
  let renderStatus:'valid'|'invalid'='valid',renderError:string|undefined
  try{
    if(forbidden.test(input.latex))throw new Error('公式包含未允许的命令')
    katex.renderToString(input.latex,{throwOnError:true,trust:false,strict:'error',maxExpand:100,maxSize:8})
  }catch(error){renderStatus='invalid';renderError=(error instanceof Error?error.message:'LaTeX 无法渲染').slice(0,220)}
  const sourceStatus=sourceText.includes(input.spokenText.trim())?'matched':'unmatched'
  const semantic=renderStatus==='valid'?numericEquation(input.latex):{status:'unchecked' as const,detail:'先修复排版后才能检验'}
  const semanticStatus=input.alternatives?.length?'ambiguous':semantic.status
  const seed=`${input.sourceSegmentId}\0${input.latex}`
  return formulaPropsSchema.parse({...input,id:`formula-${formulaHash(seed,14695981039346656037n)}${formulaHash(seed,7809847782465536322n)}`,sourceRevision,renderStatus,...(renderError?{renderError}:{}),sourceStatus,semanticStatus,semanticDetail:input.alternatives?.length?'口述存在多种解释，请选择后再核对':semantic.detail,studentConfirmed:false,locked:false})
}
