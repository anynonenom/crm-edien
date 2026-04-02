import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";
import { logActivity } from "../_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const { data } = await supabase
        .from("tasks")
        .select("*, users!assignee_id(name), deals!related_deal_id(title)")
        .order("due_date", { ascending: true });
      res.json(
        (data || []).map((t: any) => ({
          ...t,
          assignee_name: t.users?.name || "",
          deal_title: t.deals?.title || "",
        }))
      );
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "POST") {
    const { title, description, assignee_id, related_deal_id, workspace_id, due_date, status, priority } =
      req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });
    try {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title,
          description,
          assignee_id: assignee_id || null,
          related_deal_id: related_deal_id || null,
          workspace_id: workspace_id || null,
          due_date,
          status: status || "Pending",
          priority: priority || "Medium",
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      await logActivity(assignee_id || 1, `Created task: ${title}`, title, "task");
      res.json({ id: data?.id });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
