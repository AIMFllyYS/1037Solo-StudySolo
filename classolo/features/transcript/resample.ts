export const TARGET_SAMPLE_RATE = 16000

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
