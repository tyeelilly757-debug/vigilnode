/**
 * Light structural wraps so deployed pages differ without changing core meaning.
 * (Smarter diversification can replace this later.)
 */
export function tweakVariant(text: string, variantIndex: number): string {
  if (variantIndex === 1) return text;
  if (variantIndex === 2) {
    return `Here's the key thing most people miss:\n\n${text}`;
  }
  if (variantIndex === 3) {
    return `${text}\n\nIn short: choosing the right specialist matters more than most people think.`;
  }
  return text;
}
