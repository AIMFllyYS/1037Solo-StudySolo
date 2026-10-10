export const MAX_INPUT_CHARACTERS = 50_000;

export function countCharacters(text: string) {
  // Count Unicode code points without allocating a second large array.
  let count = 0;
  for (const character of text) count += character ? 1 : 0;
  return count;
}

/** 输入框最大高度（与 `.chat-input-textarea` 的 CSS max-height 保持一致）。 */
export const MAX_TEXTAREA_HEIGHT = 120;