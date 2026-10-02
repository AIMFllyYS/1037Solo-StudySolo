import {cleanup,render,screen} from '@testing-library/react'
import {afterEach,expect,it} from 'vitest'
import {TranscriptSegmentLine} from '@/classolo/features/transcript/segment-line'

afterEach(cleanup)
it('shows the committed ASR segment range as a relative recording timestamp',()=>{
  render(<TranscriptSegmentLine segment={{id:'segment',seq:1,text:'第一心音由房室瓣关闭形成',startMs:65_000,endMs:68_300}} sessionId="lesson" terms={[]} highlighted={false}/>)
  expect(screen.getByText('01:05–01:08')).toHaveAttribute('data-slot','transcript-timestamp')
  expect(screen.getByRole('button',{name:'更正第1段文稿'})).toHaveClass('ss-tool')
})
