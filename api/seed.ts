import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import supabase from "./_lib/supabase";

// POST /api/seed — run once after first deployment to seed default workspace + team
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { count } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });
  if (count && count > 0)
    return res.json({ message: "Already seeded", skipped: true });

  try {
    const { data: ws } = await supabase
      .from("workspaces")
      .insert({ name: "Eiden Group" })
      .select()
      .single();
    const defaultPass = await bcrypt.hash("admin123", 10);
    const wsId = ws?.id;

    await supabase.from("users").insert([
      { name: "Oualid Laati",       email: "oualid@eiden.group",     role: "Admin",               workspace_id: wsId, username: "oualid",      password: defaultPass },
      { name: "Najlaa Zkaili",      email: "najlaa@eiden.group",     role: "Operational Manager", workspace_id: wsId, username: "najlaa",      password: defaultPass },
      { name: "Hassan Elkhadiri",   email: "hassan@eiden.group",     role: "Brand Manager",       workspace_id: wsId, username: "hassan",      password: defaultPass },
      { name: "Maryam Ha",          email: "maryam@eiden.group",     role: "Marketing Strategy",  workspace_id: wsId, username: "maryam",      password: defaultPass },
      { name: "Abdelhakim Akhidar", email: "abdelhakim@eiden.group", role: "Web / IT Developer",  workspace_id: wsId, username: "abdelhakim",  password: defaultPass },
    ]);

    await supabase
      .from("activity_log")
      .insert({ user_id: null, action: "System initialized", related_to: "Eiden AI CRM", type: "system" });

    res.json({ message: "Seeded successfully", workspace_id: wsId });
  } catch (err: any) {
    console.error("Seed error:", err);
    res.status(500).json({ error: "Seed failed", details: err.message });
  }
}
