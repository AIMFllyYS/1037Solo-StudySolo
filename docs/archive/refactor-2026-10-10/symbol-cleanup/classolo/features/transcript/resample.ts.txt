export const TARGET_SAMPLE_RATE = 16000

/** A continuous, band-limited resampler. Phase and filter history survive AudioWorklet frames. */
export function createStreamingResampler(inputRate: number) {
  if (!Number.isFinite(inputRate) || inputRate <= 0) throw new Error('inputRate must be positive')
  const taps = inputRate > TARGET_SAMPLE_RATE ? 63 : 1
  const history = new Float64Array(taps)
  const kernel = new Float64Array(taps)
  if (taps === 1) kernel[0] = 1
  else {
    const cutoff = 0.45 * TARGET_SAMPLE_RATE / inputRate
    let sum=0
    for(let i=0;i<taps;i++){
      const x=i-(taps-1)/2
      const sinc=x===0?2*cutoff:Math.sin(2*Math.PI*cutoff*x)/(Math.PI*x)
      kernel[i]=sinc*(0.5-0.5*Math.cos(2*Math.PI*i/(taps-1)));sum+=kernel[i]
    }
    for(let i=0;i<taps;i++)kernel[i]/=sum
  }
  let phase=0,index=0,previous=0
  return {
    process(input:Float32Array):Float32Array {
      if(inputRate===TARGET_SAMPLE_RATE)return input.slice()
      const out:number[]=[]
      for(const sample of input){
        history[index]=sample
        let filtered=0
        for(let k=0;k<taps;k++)filtered+=kernel[k]*history[(index-k+taps)%taps]
        index=(index+1)%taps
        phase+=TARGET_SAMPLE_RATE
        while(phase>=inputRate){
          phase-=inputRate
          const fraction=1-phase/TARGET_SAMPLE_RATE
          out.push(previous+(filtered-previous)*fraction)
        }
        previous=filtered
      }
      return Float32Array.from(out)
    },
    reset(){history.fill(0);phase=0;index=0;previous=0},
  }
}

/** Linear resample Float32 PCM to 16 kHz. */
export function resampleTo16k(
  input: Float32Array,
  inputRate: number,
): Float32Array {
  if (inputRate <= 0) {
    throw new Error('inputRate must be positive')
  }
  if (inputRate === TARGET_SAMPLE_RATE) {
    return input.slice()
  }
  const ratio = inputRate / TARGET_SAMPLE_RATE
  const outLength = Math.max(0, Math.floor(input.length / ratio))
  const output = new Float32Array(outLength)
  for (let i = 0; i < outLength; i += 1) {
    const srcIndex = i * ratio
    const left = Math.floor(srcIndex)
    const right = Math.min(left + 1, input.length - 1)
    const t = srcIndex - left
    const a = input[left] ?? 0
    const b = input[right] ?? a
    output[i] = a + (b - a) * t
  }
  return output
}

export function floatToPcm16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0))
    output[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff)
  }
  return output
}

export function peakLevel(input: Float32Array): number {
  let peak = 0
  for (let i = 0; i < input.length; i += 1) {
    const abs = Math.abs(input[i] ?? 0)
    if (abs > peak) peak = abs
  }
  return peak
}
