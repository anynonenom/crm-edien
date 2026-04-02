import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";
import { logActivity } from "../_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (req.method === "PATCH") {
    const { title, value, stage, risk_score, win_probability, notes, contact_id } = req.body;
    try {
      await supabase
        .from("deals")
        .update({ title, value, stage, risk_score, win_probability, notes, contact_id })
        .eq("id", id);
      if (stage) await logActivity(1, `Updated deal stage to ${stage}`, String(id), "deal");
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "DELETE") {
    try {
      await supabase.from("deals").delete().eq("id", id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
