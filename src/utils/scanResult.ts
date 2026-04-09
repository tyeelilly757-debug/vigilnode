import type { ScanResult } from "../types/core";
import { extractEntities, extractFirstMention, extractNumbers } from "./parser";

export function scanResultFromRaw(prompt: string, raw: string): ScanResult {
  return {
    prompt,
    raw,
    entities: extractEntities(raw),
    firstMention: extractFirstMention(raw),
    evidence: extractNumbers(raw),
  };
}
