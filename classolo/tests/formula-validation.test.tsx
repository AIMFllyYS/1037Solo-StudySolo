import {describe,expect,it} from 'vitest'
import {validateFormulaProposal} from '@/classolo/features/formulas/validate'
const sourceSegmentId='33333333-3333-4333-8333-333333333333'
const check=(latex:string,spokenText='老师说二加二等于四',alternatives?:string[])=>validateFormulaProposal({sourceSegmentId,spokenText,latex,alternatives},spokenText,0)
describe('explicitly scoped classroom formula verification',()=>{
  it('renders and checks exact numeric equality with rational arithmetic',()=>{
    expect(check('2+2=4')).toMatchObject({renderStatus:'valid',sourceStatus:'matched',semanticStatus:'checked',studentConfirmed:false})
    expect(check('\\frac{1}{2}+\\frac{1}{2}=1')).toMatchObject({renderStatus:'valid',semanticStatus:'checked'})
    expect(check('0.1+0.2=0.3')).toMatchObject({renderStatus:'valid',semanticStatus:'checked'})
    expect(check('-2^2=-4').semanticStatus).toBe('checked')
    expect(check('(-2)^2=4').semanticStatus).toBe('checked')
  })
  it('marks a false numeric equality invalid but leaves symbolic claims unverified',()=>{
    expect(check('2+2=5').semanticStatus).toBe('invalid')
    expect(check('-2^2=4').semanticStatus).toBe('invalid')
    expect(check('F=ma').semanticStatus).toBe('unchecked')
    expect(check('\\frac{1}{0}=2').semanticStatus).toBe('invalid')
  })
  it('does not silently choose between ambiguous spoken mathematics or invented sources',()=>{
    expect(check('(a+b)^2','a加b的平方',['a+b^2','(a+b)^2'])).toMatchObject({semanticStatus:'ambiguous',sourceStatus:'matched'})
    expect(validateFormulaProposal({sourceSegmentId,spokenText:'原文没有的公式',latex:'2+2=4'},'老师讲的是别的内容',1)).toMatchObject({sourceStatus:'unmatched',sourceRevision:1})
  })
  it('handles a chemistry expression as renderable while its chemical meaning remains unchecked',()=>{
    expect(check('\\ce{H2O}')).toMatchObject({renderStatus:'valid',semanticStatus:'unchecked'})
  })
  it('renders a medical dosage expression without claiming unit or clinical validation',()=>{
    expect(check('D=\\frac{m}{kg}','按体重给药的剂量等于药量除以体重')).toMatchObject({renderStatus:'valid',sourceStatus:'matched',semanticStatus:'unchecked'})
  })
  it('rejects unsafe commands and malformed LaTeX without claiming that it is verified',()=>{
    expect(check('\\href{https://example.com}{x}')).toMatchObject({renderStatus:'invalid',semanticStatus:'unchecked'})
    expect(check('\\frac{1}{')).toMatchObject({renderStatus:'invalid',semanticStatus:'unchecked'})
  })
})
