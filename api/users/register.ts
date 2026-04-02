import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import supabase from "../_lib/supabase";
import { logActivity } from "../_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { name, email, username, password, company_name } = req.body;
  if (!name || !email || !username || !password || !company_name)
    return res.status(400).json({ error: "Missing required fields" });
  try {
    const { data: exists } = await supabase
      .from("users")
      .select("id")
      .or(`username.eq.${username},email.eq.${email}`)
      .maybeSingle();
    if (exists) return res.status(409).json({ error: "Username or email already taken" });

    const { data: existingWs } = await supabase
      .from("workspaces")
      .select("id, name")
      .ilike("name", company_name)
      .maybeSingle();

    let workspace_id: number;
    let role: string;
    if (existingWs) {
      workspace_id = existingWs.id;
      role = "Commercial";
    } else {
      const { data: newWs } = await supabase
        .from("workspaces")
        .insert({ name: company_name })
        .select()
        .single();
      workspace_id = newWs!.id;
      role = "Admin";
    }

    const hashed = await bcrypt.hash(password, 10);
    const { data } = await supabase
      .from("users")
      .insert({ name, email, username, password: hashed, role, workspace_id })
      .select()
      .single();
    await logActivity(data?.id, `Registered: ${name}`, `${company_name} (${role})`, "auth");
    res.json({ id: data?.id, role, workspace_id });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
