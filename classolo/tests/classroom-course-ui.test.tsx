import {afterEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {ClassroomCourseForm} from '@/classolo/features/settings/classroom-course-form'
import {DEFAULT_CLASS_COURSE_PROFILE,reviewSubjectForClass} from '@/classolo/lib/course/profile'
afterEach(cleanup)
describe('classroom subject selection',()=>{
  it('saves a clearly chosen medical course, language and terms with a real curriculum link',()=>{
    const saved=vi.fn();render(<ClassroomCourseForm profile={DEFAULT_CLASS_COURSE_PROFILE} recording={false} onSave={saved}/>)
    fireEvent.change(screen.getByLabelText('课堂学科大类'),{target:{value:'medicine'}})
    fireEvent.change(screen.getByLabelText('课堂二级学科'),{target:{value:'anatomy'}})
    fireEvent.change(screen.getByLabelText('课堂名称'),{target:{value:'系统解剖学第3讲'}})
    fireEvent.change(screen.getByLabelText('课堂授课语言'),{target:{value:'mixed'}})
    fireEvent.change(screen.getByLabelText('关联教材'),{target:{value:'anatomy'}})
    fireEvent.change(screen.getByLabelText('本课专有名词'),{target:{value:'锁骨下动脉\n肝门静脉'}})
    expect(screen.getByText(/下次录音将使用/)).toHaveTextContent('没有被截掉的术语')
    fireEvent.click(screen.getByText('保存课堂设置'))
    expect(saved).toHaveBeenCalledOnce();expect(saved.mock.calls[0][0]).toMatchObject({disciplineId:'medicine',subdisciplineId:'anatomy',courseName:'系统解剖学第3讲',language:'mixed',materialSubjectId:'anatomy',customTerms:['锁骨下动脉','肝门静脉']})
    expect(reviewSubjectForClass(saved.mock.calls[0][0])).toBe('anatomy')
  })
  it('rejects a term beyond the bounded prompt without corrupting the saved profile',()=>{
    const saved=vi.fn();render(<ClassroomCourseForm profile={DEFAULT_CLASS_COURSE_PROFILE} recording={false} onSave={saved}/>)
    fireEvent.change(screen.getByLabelText('本课专有名词'),{target:{value:'长'.repeat(41)}})
    fireEvent.click(screen.getByText('保存课堂设置'))
    expect(screen.getByRole('alert')).toBeInTheDocument();expect(saved).not.toHaveBeenCalled()
  })
})
