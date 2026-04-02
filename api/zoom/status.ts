import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const workspaceId = Number(req.query.workspace_id || 0);
  if (!workspaceId) return res.status(400).json({ error: "workspace_id required" });
  try {
    const { data } = await supabase
      .from("zoom_tokens")
      .select("zoom_email")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!data) return res.json({ connected: false });
    res.json({ connected: true, email: data.zoom_email });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}
