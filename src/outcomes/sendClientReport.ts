import nodemailer from "nodemailer";
import { buildClientProof } from "./clientProof";

function createTransport(): nodemailer.Transporter {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS?.trim();
  const host = process.env.EMAIL_HOST?.trim();
  const portRaw = process.env.EMAIL_PORT?.trim();
  const port = portRaw ? Number(portRaw) : NaN;
  const secure =
    process.env.EMAIL_SECURE === "1" ||
    process.env.EMAIL_SECURE === "true" ||
    process.env.EMAIL_SECURE === "yes";

  if (host && user && pass && Number.isFinite(port)) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  const service = process.env.EMAIL_SERVICE?.trim() || "gmail";
  if (!user || !pass) {
    throw new Error(
      "Email not configured: set EMAIL_USER + EMAIL_PASS (and optionally EMAIL_HOST, EMAIL_PORT for SMTP).",
    );
  }
  return nodemailer.createTransport({
    service,
    auth: { user, pass },
  });
}

let cached: nodemailer.Transporter | null = null;

function transporter(): nodemailer.Transporter {
  if (!cached) cached = createTransport();
  return cached;
}

export async function sendClientReport(
  clientName: string,
  prompts: string[],
  email: string,
): Promise<boolean> {
  const report = buildClientProof(clientName, prompts);

  if (!report) {
    console.log(`No data for ${clientName}`);
    return false;
  }

  const from = process.env.EMAIL_FROM?.trim() || process.env.EMAIL_USER?.trim();
  if (!from) {
    throw new Error("Set EMAIL_FROM or EMAIL_USER for the From address.");
  }

  const body = `AI VISIBILITY REPORT

Client: ${report.clientName}

Prompts tracked: ${report.prompts}
Improving: ${report.improving}
Stable: ${report.stable}
Declining: ${report.declining}

Avg change: ${report.avgChange >= 0 ? "+" : ""}${report.avgChange}
Total trajectory: ${report.totalTrajectory >= 0 ? "+" : ""}${report.totalTrajectory}

This report reflects stored outcome snapshots (AI citation visibility over time).
`;

  await transporter().sendMail({
    from,
    to: email.trim(),
    subject: `AI Visibility Report — ${clientName}`,
    text: body,
  });

  console.log(`📧 Sent report to ${email}`);
  return true;
}
