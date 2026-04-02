import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const { data } = await supabase
      .from("users")
      .select("id, name, role, workspace_id, email, username");
    res.json(data || []);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}
