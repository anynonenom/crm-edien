import type { VercelRequest, VercelResponse } from "@vercel/node";
import { logActivity } from "../../_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { text } = req.body;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return res.status(500).json({ error: "SLACK_WEBHOOK_URL not configured" });
  if (!text) return res.status(400).json({ error: "text is required" });
  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) return res.status(502).json({ error: "Slack webhook failed" });
    await logActivity(1, "Sent Slack message", text.slice(0, 80), "integration");
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}
