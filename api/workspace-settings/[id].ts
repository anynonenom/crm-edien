import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const wid = Number(req.query.id);
  if (!wid) return res.status(400).json({ error: "workspace_id required" });

  if (req.method === "GET") {
    try {
      const { data } = await supabase
        .from("workspace_settings")
        .select("meeting_link")
        .eq("workspace_id", wid)
        .maybeSingle();
      res.json({ meeting_link: data?.meeting_link || "" });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "POST") {
    const { meeting_link } = req.body || {};
    try {
      await supabase.from("workspace_settings").upsert(
        {
          workspace_id: wid,
          meeting_link: String(meeting_link || ""),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" }
      );
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
