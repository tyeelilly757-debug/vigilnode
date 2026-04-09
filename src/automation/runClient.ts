import { runAudit } from "../jobs/runAudit";
import type { ClientAutomationConfig } from "./clients";

export async function runClient(client: ClientAutomationConfig): Promise<void> {
  console.log(`\n🚀 Running client: ${client.name}\n`);

  for (const prompt of client.prompts) {
    const p = prompt.trim();
    if (!p) continue;
    console.log(`🔍 Prompt: ${p}`);
    const { jobId } = await runAudit(client.business, { prompts: [p] });
    console.log(`   job: ${jobId}`);
  }

  console.log(`\n✅ Finished client: ${client.name}\n`);
}
