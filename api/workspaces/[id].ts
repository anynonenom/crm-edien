import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";
import { logActivity } from "../_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (req.method === "PATCH") {
    const { name } = req.body;
    try {
      await supabase.from("workspaces").update({ name }).eq("id", id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "DELETE") {
    try {
      await supabase.from("chat_messages").delete().eq("workspace_id", id);
      await supabase.from("workspace_settings").delete().eq("workspace_id", id);
      await supabase.from("zoom_tokens").delete().eq("workspace_id", id);
      await supabase.from("tasks").delete().eq("workspace_id", id);
      await supabase.from("deals").delete().eq("workspace_id", id);
      await supabase.from("contacts").delete().eq("workspace_id", id);
      await supabase.from("users").update({ workspace_id: null }).eq("workspace_id", id);
      await supabase.from("workspaces").delete().eq("id", id);
      await logActivity(1, `Deleted workspace #${id}`, "", "system");
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
