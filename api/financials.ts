import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "./_lib/supabase";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const { data: deals } = await supabase.from("deals").select("value, stage, created_at");
    const d = deals || [];
    const totalRevenue = d
      .filter((x: any) => x.stage === "Won")
      .reduce((s: number, x: any) => s + (x.value || 0), 0);
    const pendingRevenue = d
      .filter((x: any) => !["Won", "Lost"].includes(x.stage))
      .reduce((s: number, x: any) => s + (x.value || 0), 0);
    const monthMap: Record<string, number> = {};
    d.filter((x: any) => x.stage === "Won").forEach((x: any) => {
      const month = (x.created_at || "").slice(0, 7);
      if (month) monthMap[month] = (monthMap[month] || 0) + (x.value || 0);
    });
    const monthly = Object.entries(monthMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, total]) => ({ month, total }));
    res.json({ totalRevenue, pendingRevenue, monthly });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}
