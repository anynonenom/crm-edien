import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";
import { logActivity } from "../_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed" });
  const workspaceId = Number(req.query.workspace_id || 0);
  if (!workspaceId) return res.status(400).json({ error: "workspace_id required" });
  try {
    await supabase.from("zoom_tokens").delete().eq("workspace_id", workspaceId);
    await logActivity(1, "Disconnected Zoom", "", "integration");
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}
