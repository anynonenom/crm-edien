import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import supabase from "../_lib/supabase";
import { logActivity } from "../_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  try {
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .or(`username.eq.${username},email.eq.${username}`)
      .maybeSingle();
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    await logActivity(user.id, "Logged in", user.name, "auth");
    res.json({ id: user.id, name: user.name, role: user.role, workspace_id: user.workspace_id });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}
