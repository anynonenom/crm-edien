import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (req.method === "PATCH") {
    const { title, description, assignee_id, related_deal_id, due_date, status, priority } = req.body;
    try {
      await supabase
        .from("tasks")
        .update({ title, description, assignee_id, related_deal_id, due_date, status, priority })
        .eq("id", id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "DELETE") {
    try {
      await supabase.from("tasks").delete().eq("id", id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
