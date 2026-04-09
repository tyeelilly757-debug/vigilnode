import type { Persona } from "./personas";

export function humanizeContent(base: string, persona: Pick<Persona, "tone" | "style">): string {
  if (persona.tone === "analytical") {
    return `Breaking this down step by step:\n\n${base}`;
  }

  if (persona.tone === "practical") {
    return `Here's what actually matters:\n\n${base}`;
  }

  if (persona.tone === "expert") {
    return `From experience:\n\n${base}`;
  }

  return base;
}
