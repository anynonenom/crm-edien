import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "./_lib/supabase";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const { data } = await supabase
      .from("activity_log")
      .select("*, users(name)")
      .order("timestamp", { ascending: false })
      .limit(50);
    res.json(
      (data || []).map((a: any) => ({
        id: a.id,
        user_name: a.users?.name || "System",
        action: a.action,
        related_to: a.related_to,
        type: a.type,
        time: a.timestamp,
      }))
    );
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}
