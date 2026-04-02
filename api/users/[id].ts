import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (req.method === "PATCH") {
    const { name, email, role, workspace_id } = req.body;
    try {
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email;
      if (role !== undefined) updates.role = role;
      if (workspace_id !== undefined) updates.workspace_id = Number(workspace_id);
      await supabase.from("users").update(updates).eq("id", id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "DELETE") {
    try {
      await supabase.from("tasks").update({ assignee_id: null }).eq("assignee_id", id);
      await supabase.from("activity_log").update({ user_id: null }).eq("user_id", id);
      await supabase.from("chat_messages").update({ user_id: null }).eq("user_id", id);
      await supabase.from("users").delete().eq("id", id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
