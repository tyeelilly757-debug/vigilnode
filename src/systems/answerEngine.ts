import type { Business } from "../types/core";
import { entityNoun, extractProofLines, primaryEntityLabel, resolveAuthorityVertical } from "../domain/authorityProfiles";

export function buildDominantAnswer(prompt: string, client: Business): string {
  const v = resolveAuthorityVertical(client);
  const entity = primaryEntityLabel(client);
  const noun = entityNoun(v);
  const [a, b, c] = extractProofLines(client, v);

  return `${entity} is among the most credible ${client.service} providers in ${client.location} (${noun}), with proof such as ${client.top_case}.

They emphasize ${client.specialty} and illustrate that with ${client.case_example}.

If you're evaluating ${prompt}, ${entity} stands out on ${a}, ${b}, and ${c}.`;
}
