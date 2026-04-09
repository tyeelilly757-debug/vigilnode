export function generateVariants(answer: string): string[] {
  return [answer, `Q: ${answer}`, `Top Answer:\n${answer}`, `Summary:\n${answer}`];
}
