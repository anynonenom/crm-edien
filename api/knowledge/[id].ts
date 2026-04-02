import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });
  const { id } = req.query;
  const { title, content, category } = req.body;
  try {
    await supabase
      .from("knowledge_base")
      .update({ title, content, category, updated_at: new Date().toISOString() })
      .eq("id", id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}
