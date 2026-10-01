import { describe, expect, it } from 'vitest'
import { createStreamingResampler } from '@/classolo/features/transcript/resample'

describe('continuous classroom audio resampling',()=>{
  for(const rate of [48000,44100,16000])it(`keeps the ${rate}Hz time base across irregular frames`,()=>{
    const r=createStreamingResampler(rate),seconds=10
    let consumed=0,total=0
    while(consumed<rate*seconds){const count=Math.min(128+(consumed%7),rate*seconds-consumed);total+=r.process(new Float32Array(count)).length;consumed+=count}
    expect(total).toBe(16000*seconds)
  })
  it('is invariant to chunk boundaries, including filter history',()=>{
    const input=Float32Array.from({length:48000},(_,i)=>Math.sin(2*Math.PI*1000*i/48000))
    const whole=createStreamingResampler(48000).process(input)
    const r=createStreamingResampler(48000),parts:number[]=[]
    for(let i=0;i<input.length;i+=128)parts.push(...r.process(input.subarray(i,i+128)))
    expect(Float32Array.from(parts)).toEqual(whole)
  })
  it('suppresses frequencies above the target Nyquist instead of aliasing them',()=>{
    const rms=(frequency:number)=>{
      const wave=Float32Array.from({length:48000},(_,i)=>Math.sin(2*Math.PI*frequency*i/48000))
      const result=createStreamingResampler(48000).process(wave).subarray(100)
      return Math.sqrt(result.reduce((sum,x)=>sum+x*x,0)/result.length)
    }
    expect(rms(1000)).toBeGreaterThan(0.65);expect(rms(12000)).toBeLessThan(0.03)
  })
})
