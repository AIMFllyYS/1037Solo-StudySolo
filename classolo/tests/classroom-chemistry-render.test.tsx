import {describe,expect,it} from 'vitest'
import {render} from '@testing-library/react'
import {MarkdownStream} from '@/classolo/components/markdown/stream'
describe('classroom chemistry rendering',()=>{
  it('renders mhchem in ordinary classroom explanations as well as formula cards',()=>{
    const {container}=render(<MarkdownStream markdown={'化学式：$\\ce{H2O}$'}/>)
    expect(container.querySelector('.katex')).not.toBeNull()
  })
})
