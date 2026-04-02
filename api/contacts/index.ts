import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";
import { logActivity } from "../_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .order("created_at", { ascending: false });
      res.json(data || []);
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "POST") {
    const { name, company, email, phone, status, source, ltv, notes, workspace_id } = req.body;
    try {
      const { data } = await supabase
        .from("contacts")
        .insert({ name, company, email, phone, status, source, ltv, notes, workspace_id })
        .select()
        .single();
      await logActivity(1, `Added contact: ${name}`, name, "contact");
      res.json({ id: data?.id });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
