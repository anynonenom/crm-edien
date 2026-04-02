import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const workspaceId = Number(req.query.workspace_id || 0);
    if (!workspaceId) return res.status(400).json({ error: "workspace_id is required" });
    try {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, user_name, message, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .limit(200);
      res.json(
        (data || []).map((r: any) => ({
          id: r.id,
          user: r.user_name,
          text: r.message,
          created_at: r.created_at,
        }))
      );
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "POST") {
    const { workspace_id, user_id, user_name, text } = req.body || {};
    const wid = Number(workspace_id);
    const name = String(user_name || "").trim();
    const content = String(text || "").trim();
    if (!wid || !name || !content) return res.status(400).json({ error: "Missing fields" });
    try {
      const { data } = await supabase
        .from("chat_messages")
        .insert({ workspace_id: wid, user_id: user_id || null, user_name: name, message: content })
        .select()
        .single();
      // Realtime handles broadcast — no WebSocket needed
      res.json({ id: data?.id });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
