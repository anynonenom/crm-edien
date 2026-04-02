import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";
import { logActivity } from "../_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const { data } = await supabase.from("workspaces").select("*");
      res.json(data || []);
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "POST") {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Workspace name required" });
    try {
      const { data } = await supabase.from("workspaces").insert({ name }).select().single();
      await logActivity(1, `Created workspace: ${name}`, name, "system");
      res.json(data);
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
