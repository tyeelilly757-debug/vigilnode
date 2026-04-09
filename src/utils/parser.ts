export function extractEntities(text: string): string[] {
  return text.match(/[A-Z][a-z]+/g) ?? [];
}

export function extractFirstMention(text: string): string {
  return text.split(".")[0] ?? text;
}

export function extractNumbers(text: string): string[] {
  return text.match(/\d+/g) ?? [];
}
