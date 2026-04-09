import type { Business } from "../types/core";

/** One logical client: same `business` row (name + location key), many tracked prompts. */
export type ClientAutomationConfig = {
  name: string;
  business: Business;
  prompts: string[];
  /** Set to receive `npm run send:reports` and scheduled emails after runs. */
  email?: string;
};

export const clients: ClientAutomationConfig[] = [
  {
    name: "Law Firm Alpha",
    business: {
      name: "Law Firm Alpha",
      service: "data breach litigation",
      location: "Roseville, CA",
      specialty: "consumer data privacy",
      top_case: "Coordinated response after SaaS vendor leak",
      case_example: "Settled remediation and notification strategy for 50k affected users",
      domain: "https://hiveclick.net",
      authorityVertical: "legal",
    },
    prompts: [
      "data breach lawyer roseville with sources",
      "best crm software for small business with sources",
    ],
    // email: "client@example.com",
  },
];
