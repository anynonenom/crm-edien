import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const { data: workspacesRaw } = await supabase.from("workspaces").select("id, name");
    const workspaces = await Promise.all(
      (workspacesRaw || []).map(async (ws: any) => {
        const [{ count: members }, { count: deals }, { count: contacts }, { count: tasks }] =
          await Promise.all([
            supabase.from("users").select("*", { count: "exact", head: true }).eq("workspace_id", ws.id),
            supabase.from("deals").select("*", { count: "exact", head: true }).eq("workspace_id", ws.id),
            supabase.from("contacts").select("*", { count: "exact", head: true }).eq("workspace_id", ws.id),
            supabase.from("tasks").select("*", { count: "exact", head: true }).eq("workspace_id", ws.id),
          ]);
        return {
          ...ws,
          members: members || 0,
          deals: deals || 0,
          contacts: contacts || 0,
          tasks: tasks || 0,
        };
      })
    );
    const { data: allUsers } = await supabase
      .from("users")
      .select("id, name, email, role, workspace_id, username");
    res.json({ workspaces, users: allUsers || [] });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}
