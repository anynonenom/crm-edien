import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "./_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);
  try {
    const like = `%${q}%`;
    const [{ data: d }, { data: c }, { data: t }] = await Promise.all([
      supabase.from("deals").select("id, title, stage").ilike("title", like).limit(10),
      supabase
        .from("contacts")
        .select("id, name, company")
        .or(`name.ilike.${like},company.ilike.${like}`)
        .limit(10),
      supabase.from("tasks").select("id, title, status").ilike("title", like).limit(10),
    ]);
    res.json([
      ...(d || []).map((x: any) => ({ ...x, name: x.title, type: "deal" })),
      ...(c || []).map((x: any) => ({ ...x, type: "contact" })),
      ...(t || []).map((x: any) => ({ ...x, name: x.title, type: "task" })),
    ]);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}
