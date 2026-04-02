import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "./_lib/supabase";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const today = new Date().toISOString().split("T")[0];
    const [{ data: deals }, { data: contacts }, { data: tasks }] = await Promise.all([
      supabase.from("deals").select("value, stage"),
      supabase.from("contacts").select("status"),
      supabase.from("tasks").select("status, due_date"),
    ]);
    const d = deals || [];
    const c = contacts || [];
    const t = tasks || [];
    const pipelineValue = d.reduce((s: number, x: any) => s + (x.value || 0), 0);
    const activeDeals = d.filter((x: any) => !["Won", "Lost"].includes(x.stage)).length;
    const wonDeals = d.filter((x: any) => x.stage === "Won").length;
    const closedDeals = d.filter((x: any) => ["Won", "Lost"].includes(x.stage)).length;
    const winRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;
    const activeClients = c.filter((x: any) => x.status === "Active").length;
    const overdueTasks = t.filter(
      (x: any) => x.status !== "Completed" && x.due_date && x.due_date < today
    ).length;
    res.json({ pipelineValue, activeDeals, winRate: `${winRate}%`, activeClients, overdueTasks });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}
