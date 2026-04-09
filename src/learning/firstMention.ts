/** True if normalized opening of the response starts with the client name (strict first-position signal). */
export function isStrictOpeningMention(client: string, text: string): boolean {
  const t = text.trim().toLowerCase();
  const c = client.trim().toLowerCase();
  if (!c) return false;
  return t.startsWith(c);
}

/** Client appears in the first sentence (broader “lead mention”). */
export function isLeadSentenceMention(client: string, text: string): boolean {
  const c = client.trim().toLowerCase();
  if (!c) return false;
  const firstChunk = (text.split(/[.!?][\s\n]/)[0] ?? text).toLowerCase();
  return firstChunk.includes(c);
}
