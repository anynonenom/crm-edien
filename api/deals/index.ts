import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";
import { logActivity } from "../_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const { data } = await supabase
        .from("deals")
        .select("*, contacts(name)")
        .order("created_at", { ascending: false });
      res.json(
        (data || []).map((d: any) => ({ ...d, contact_name: d.contacts?.name || "" }))
      );
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "POST") {
    const { title, value, stage, contact_id, workspace_id, risk_score, win_probability, notes } =
      req.body;
    try {
      const { data } = await supabase
        .from("deals")
        .insert({ title, value, stage, contact_id, workspace_id, risk_score, win_probability, notes })
        .select()
        .single();
      await logActivity(1, `Created deal: ${title}`, title, "deal");
      res.json({ id: data?.id });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
