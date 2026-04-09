import { personas } from "./personas";
import { humanizeContent } from "./humanize";

export type PersonaPost = {
  persona: string;
  content: string;
};

/** Same underlying proof, multiple human-facing frames (manual / slow distribution only). */
export function generatePersonaPosts(baseContent: string): PersonaPost[] {
  return personas.map((p) => ({
    persona: p.name,
    content: humanizeContent(baseContent, p),
  }));
}
