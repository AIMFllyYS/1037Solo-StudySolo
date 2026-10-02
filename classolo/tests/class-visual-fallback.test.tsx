import {expect,it} from 'vitest'
import {outlineVisualFallback} from '@/classolo/features/agent/class-visual'

it('draws a bounded escaped concept diagram when a model fails to call the drawing tool',()=>{
  const svg=outlineVisualFallback(['心动周期','第一心音 <script>alert(1)</script>','第二心音'])
  expect(svg).toContain('<svg')
  expect(svg).toContain('</svg>')
  expect(svg).toContain('&lt;script&gt;')
  expect(svg).not.toContain('<script>')
  expect(outlineVisualFallback([])).toBeNull()
})
