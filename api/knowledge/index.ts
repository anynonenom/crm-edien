import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const { data } = await supabase.from("knowledge_base").select("*").order("category");
      res.json(data || []);
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "POST") {
    const { title, content, category } = req.body;
    try {
      const { data } = await supabase
        .from("knowledge_base")
        .insert({ title, content, category })
        .select()
        .single();
      res.json({ id: data?.id });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
