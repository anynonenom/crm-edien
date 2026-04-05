import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import supabase from "./_lib/supabase";
import { sendToAI } from "./_lib/ai";
import { getZoomAccessToken } from "./_lib/zoom";
import { logActivity } from "./_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawPath = req.query.path;
  const segments: string[] = Array.isArray(rawPath)
    ? rawPath
    : typeof rawPath === "string"
    ? rawPath.split("/").filter(Boolean)
    : [];
  const [r0, r1, r2] = segments;
  const { method } = req;

  try {
    // ─── Stats ────────────────────────────────────────────────────────────────
    if (r0 === "stats" && method === "GET") {
      const today = new Date().toISOString().split("T")[0];
      const [{ data: deals }, { data: contacts }, { data: tasks }] = await Promise.all([
        supabase.from("deals").select("value, stage"),
        supabase.from("contacts").select("status"),
        supabase.from("tasks").select("status, due_date"),
      ]);
      const d = deals || [], c = contacts || [], t = tasks || [];
      const pipelineValue = d.reduce((s: number, x: any) => s + (x.value || 0), 0);
      const activeDeals = d.filter((x: any) => !["Won", "Lost"].includes(x.stage)).length;
      const wonDeals = d.filter((x: any) => x.stage === "Won").length;
      const closedDeals = d.filter((x: any) => ["Won", "Lost"].includes(x.stage)).length;
      const winRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;
      const activeClients = c.filter((x: any) => x.status === "Active").length;
      const overdueTasks = t.filter((x: any) => x.status !== "Completed" && x.due_date && x.due_date < today).length;
      return res.json({ pipelineValue, activeDeals, winRate: `${winRate}%`, activeClients, overdueTasks });
    }

    // ─── Deals ────────────────────────────────────────────────────────────────
    if (r0 === "deals") {
      if (!r1) {
        if (method === "GET") {
          const { data } = await supabase.from("deals").select("*, contacts(name)").order("created_at", { ascending: false });
          return res.json((data || []).map((d: any) => ({ ...d, contact_name: d.contacts?.name || "" })));
        }
        if (method === "POST") {
          const { title, value, stage, contact_id, workspace_id, risk_score, win_probability, notes } = req.body;
          const { data } = await supabase.from("deals").insert({ title, value, stage, contact_id, workspace_id, risk_score, win_probability, notes }).select().single();
          await logActivity(1, `Created deal: ${title}`, title, "deal");
          return res.json({ id: data?.id });
        }
      }
      if (r1) {
        if (method === "PATCH") {
          const { title, value, stage, risk_score, win_probability, notes, contact_id } = req.body;
          await supabase.from("deals").update({ title, value, stage, risk_score, win_probability, notes, contact_id }).eq("id", r1);
          if (stage) await logActivity(1, `Updated deal stage to ${stage}`, r1, "deal");
          return res.json({ success: true });
        }
        if (method === "DELETE") {
          await supabase.from("deals").delete().eq("id", r1);
          return res.json({ success: true });
        }
      }
    }

    // ─── Contacts ────────────────────────────────────────────────────────────
    if (r0 === "contacts") {
      if (!r1) {
        if (method === "GET") {
          const { data } = await supabase.from("contacts").select("*").order("created_at", { ascending: false });
          return res.json(data || []);
        }
        if (method === "POST") {
          const { name, company, email, phone, status, source, ltv, notes, workspace_id } = req.body;
          const { data } = await supabase.from("contacts").insert({ name, company, email, phone, status, source, ltv, notes, workspace_id }).select().single();
          await logActivity(1, `Added contact: ${name}`, name, "contact");
          return res.json({ id: data?.id });
        }
      }
      if (r1) {
        if (method === "PATCH") {
          const { name, company, email, phone, status, source, ltv, notes } = req.body;
          await supabase.from("contacts").update({ name, company, email, phone, status, source, ltv, notes }).eq("id", r1);
          return res.json({ success: true });
        }
        if (method === "DELETE") {
          await supabase.from("contacts").delete().eq("id", r1);
          return res.json({ success: true });
        }
      }
    }

    // ─── Tasks ────────────────────────────────────────────────────────────────
    if (r0 === "tasks") {
      if (!r1) {
        if (method === "GET") {
          const { data } = await supabase.from("tasks").select("*, users!assignee_id(name), deals!related_deal_id(title)").order("due_date", { ascending: true });
          return res.json((data || []).map((t: any) => ({ ...t, assignee_name: t.users?.name || "", deal_title: t.deals?.title || "" })));
        }
        if (method === "POST") {
          const { title, description, assignee_id, related_deal_id, workspace_id, due_date, status, priority } = req.body;
          if (!title) return res.status(400).json({ error: "Title is required" });
          const { data, error } = await supabase.from("tasks").insert({ title, description, assignee_id: assignee_id || null, related_deal_id: related_deal_id || null, workspace_id: workspace_id || null, due_date, status: status || "Pending", priority: priority || "Medium" }).select().single();
          if (error) return res.status(500).json({ error: error.message });
          await logActivity(assignee_id || 1, `Created task: ${title}`, title, "task");
          return res.json({ id: data?.id });
        }
      }
      if (r1) {
        if (method === "PATCH") {
          const { title, description, assignee_id, related_deal_id, due_date, status, priority } = req.body;
          await supabase.from("tasks").update({ title, description, assignee_id, related_deal_id, due_date, status, priority }).eq("id", r1);
          return res.json({ success: true });
        }
        if (method === "DELETE") {
          await supabase.from("tasks").delete().eq("id", r1);
          return res.json({ success: true });
        }
      }
    }

    // ─── Users ────────────────────────────────────────────────────────────────
    if (r0 === "users") {
      if (!r1 && method === "GET") {
        const { data } = await supabase.from("users").select("id, name, role, workspace_id, email, username");
        return res.json(data || []);
      }
      if (r1 === "login" && method === "POST") {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Username and password required" });
        const { data: user } = await supabase.from("users").select("*").or(`username.eq.${username},email.eq.${username}`).maybeSingle();
        if (!user) return res.status(401).json({ error: "Invalid credentials" });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: "Invalid credentials" });
        await logActivity(user.id, "Logged in", user.name, "auth");
        return res.json({ id: user.id, name: user.name, role: user.role, workspace_id: user.workspace_id });
      }
      if (r1 === "register" && method === "POST") {
        const { name, email, username, password, company_name, role: requestedRole } = req.body;
        if (!name || !email || !username || !password || !company_name || !requestedRole) return res.status(400).json({ error: "Missing required fields" });
        const { data: exists } = await supabase.from("users").select("id").or(`username.eq.${username},email.eq.${email}`).maybeSingle();
        if (exists) return res.status(409).json({ error: "Username or email already taken" });
        const { data: existingWs } = await supabase.from("workspaces").select("id, name").ilike("name", company_name).maybeSingle();
        let workspace_id: number, role: string;
        if (existingWs) {
          workspace_id = existingWs.id;
          role = requestedRole === "Admin" ? requestedRole : requestedRole;
        } else {
          const { data: newWs } = await supabase.from("workspaces").insert({ name: company_name }).select().single();
          workspace_id = newWs!.id; role = "Admin";
        }
        const hashed = await bcrypt.hash(password, 10);
        const { data } = await supabase.from("users").insert({ name, email, username, password: hashed, role, workspace_id }).select().single();
        await logActivity(data?.id, `Registered: ${name}`, `${company_name} (${role})`, "auth");
        return res.json({ id: data?.id, role, workspace_id });
      }
      if (r1 && r1 !== "login" && r1 !== "register") {
        if (method === "PATCH") {
          const { name, email, role, workspace_id } = req.body;
          const updates: any = {};
          if (name !== undefined) updates.name = name;
          if (email !== undefined) updates.email = email;
          if (role !== undefined) updates.role = role;
          if (workspace_id !== undefined) updates.workspace_id = Number(workspace_id);
          await supabase.from("users").update(updates).eq("id", r1);
          return res.json({ success: true });
        }
        if (method === "DELETE") {
          await supabase.from("tasks").update({ assignee_id: null }).eq("assignee_id", r1);
          await supabase.from("activity_log").update({ user_id: null }).eq("user_id", r1);
          await supabase.from("chat_messages").update({ user_id: null }).eq("user_id", r1);
          await supabase.from("users").delete().eq("id", r1);
          return res.json({ success: true });
        }
      }
    }

    // ─── Workspaces ──────────────────────────────────────────────────────────
    if (r0 === "workspaces") {
      if (!r1) {
        if (method === "GET") {
          const { data } = await supabase.from("workspaces").select("*");
          return res.json(data || []);
        }
        if (method === "POST") {
          const { name } = req.body;
          if (!name) return res.status(400).json({ error: "Workspace name required" });
          const { data } = await supabase.from("workspaces").insert({ name }).select().single();
          await logActivity(1, `Created workspace: ${name}`, name, "system");
          return res.json(data);
        }
      }
      if (r1) {
        if (method === "PATCH") {
          const { name } = req.body;
          await supabase.from("workspaces").update({ name }).eq("id", r1);
          return res.json({ success: true });
        }
        if (method === "DELETE") {
          await supabase.from("chat_messages").delete().eq("workspace_id", r1);
          await supabase.from("workspace_settings").delete().eq("workspace_id", r1);
          await supabase.from("zoom_tokens").delete().eq("workspace_id", r1);
          await supabase.from("tasks").delete().eq("workspace_id", r1);
          await supabase.from("deals").delete().eq("workspace_id", r1);
          await supabase.from("contacts").delete().eq("workspace_id", r1);
          await supabase.from("users").update({ workspace_id: null }).eq("workspace_id", r1);
          await supabase.from("workspaces").delete().eq("id", r1);
          await logActivity(1, `Deleted workspace #${r1}`, "", "system");
          return res.json({ success: true });
        }
      }
    }

    // ─── Workspace Settings ───────────────────────────────────────────────────
    if (r0 === "workspace-settings" && r1) {
      const wid = Number(r1);
      if (!wid) return res.status(400).json({ error: "workspace_id required" });
      if (method === "GET") {
        const { data } = await supabase.from("workspace_settings").select("meeting_link").eq("workspace_id", wid).maybeSingle();
        return res.json({ meeting_link: data?.meeting_link || "" });
      }
      if (method === "POST") {
        const { meeting_link } = req.body || {};
        await supabase.from("workspace_settings").upsert(
          { workspace_id: wid, meeting_link: String(meeting_link || ""), updated_at: new Date().toISOString() },
          { onConflict: "workspace_id" }
        );
        return res.json({ success: true });
      }
    }

    // ─── Activity ────────────────────────────────────────────────────────────
    if (r0 === "activity" && method === "GET") {
      const { data } = await supabase.from("activity_log").select("*, users(name)").order("timestamp", { ascending: false }).limit(50);
      return res.json((data || []).map((a: any) => ({
        id: a.id, user_name: a.users?.name || "System",
        action: a.action, related_to: a.related_to, type: a.type, time: a.timestamp,
      })));
    }

    // ─── Knowledge Base ───────────────────────────────────────────────────────
    if (r0 === "knowledge") {
      if (!r1) {
        if (method === "GET") {
          const { data } = await supabase.from("knowledge_base").select("*").order("category");
          return res.json(data || []);
        }
        if (method === "POST") {
          const { title, content, category } = req.body;
          const { data } = await supabase.from("knowledge_base").insert({ title, content, category }).select().single();
          return res.json({ id: data?.id });
        }
      }
      if (r1 && method === "PATCH") {
        const { title, content, category } = req.body;
        await supabase.from("knowledge_base").update({ title, content, category, updated_at: new Date().toISOString() }).eq("id", r1);
        return res.json({ success: true });
      }
      if (r1 && method === "DELETE") {
        await supabase.from("knowledge_base").delete().eq("id", r1);
        return res.json({ success: true });
      }
    }

    // ─── Financials ───────────────────────────────────────────────────────────
    if (r0 === "financials" && method === "GET") {
      const { data: deals } = await supabase.from("deals").select("value, stage, created_at");
      const d = deals || [];
      const totalRevenue = d.filter((x: any) => x.stage === "Won").reduce((s: number, x: any) => s + (x.value || 0), 0);
      const pendingRevenue = d.filter((x: any) => !["Won", "Lost"].includes(x.stage)).reduce((s: number, x: any) => s + (x.value || 0), 0);
      const monthMap: Record<string, number> = {};
      d.filter((x: any) => x.stage === "Won").forEach((x: any) => {
        const month = (x.created_at || "").slice(0, 7);
        if (month) monthMap[month] = (monthMap[month] || 0) + (x.value || 0);
      });
      const monthly = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([month, total]) => ({ month, total }));
      return res.json({ totalRevenue, pendingRevenue, monthly });
    }

    // ─── Search ───────────────────────────────────────────────────────────────
    if (r0 === "search" && method === "GET") {
      const q = String(req.query.q || "").trim();
      if (!q) return res.json([]);
      const like = `%${q}%`;
      const [{ data: d }, { data: c }, { data: t }] = await Promise.all([
        supabase.from("deals").select("id, title, stage").ilike("title", like).limit(10),
        supabase.from("contacts").select("id, name, company").or(`name.ilike.${like},company.ilike.${like}`).limit(10),
        supabase.from("tasks").select("id, title, status").ilike("title", like).limit(10),
      ]);
      return res.json([
        ...(d || []).map((x: any) => ({ ...x, name: x.title, type: "deal" })),
        ...(c || []).map((x: any) => ({ ...x, type: "contact" })),
        ...(t || []).map((x: any) => ({ ...x, name: x.title, type: "task" })),
      ]);
    }

    // ─── Chat ─────────────────────────────────────────────────────────────────
    if (r0 === "chat") {
      if (method === "GET") {
        const workspaceId = Number(req.query.workspace_id || 0);
        if (!workspaceId) return res.status(400).json({ error: "workspace_id is required" });
        const { data } = await supabase.from("chat_messages").select("id, user_name, message, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: true }).limit(200);
        return res.json((data || []).map((r: any) => ({ id: r.id, user: r.user_name, text: r.message, created_at: r.created_at })));
      }
      if (method === "POST") {
        const { workspace_id, user_id, user_name, text } = req.body || {};
        const wid = Number(workspace_id);
        const name = String(user_name || "").trim();
        const content = String(text || "").trim();
        if (!wid || !name || !content) return res.status(400).json({ error: "Missing fields" });
        const { data } = await supabase.from("chat_messages").insert({ workspace_id: wid, user_id: user_id || null, user_name: name, message: content }).select().single();
        return res.json({ id: data?.id });
      }
    }

    // ─── Admin ────────────────────────────────────────────────────────────────
    if (r0 === "admin" && r1 === "overview" && method === "GET") {
      const { data: workspacesRaw } = await supabase.from("workspaces").select("id, name");
      const workspaces = await Promise.all((workspacesRaw || []).map(async (ws: any) => {
        const [{ count: members }, { count: deals }, { count: contacts }, { count: tasks }] = await Promise.all([
          supabase.from("users").select("*", { count: "exact", head: true }).eq("workspace_id", ws.id),
          supabase.from("deals").select("*", { count: "exact", head: true }).eq("workspace_id", ws.id),
          supabase.from("contacts").select("*", { count: "exact", head: true }).eq("workspace_id", ws.id),
          supabase.from("tasks").select("*", { count: "exact", head: true }).eq("workspace_id", ws.id),
        ]);
        return { ...ws, members: members || 0, deals: deals || 0, contacts: contacts || 0, tasks: tasks || 0 };
      }));
      const { data: allUsers } = await supabase.from("users").select("id, name, email, role, workspace_id, username");
      return res.json({ workspaces, users: allUsers || [] });
    }

    // ─── Slack ────────────────────────────────────────────────────────────────
    if (r0 === "integrations" && r1 === "slack" && r2 === "message" && method === "POST") {
      const { text } = req.body;
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (!webhookUrl) return res.status(500).json({ error: "SLACK_WEBHOOK_URL not configured" });
      if (!text) return res.status(400).json({ error: "text is required" });
      const resp = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!resp.ok) return res.status(502).json({ error: "Slack webhook failed" });
      await logActivity(1, "Sent Slack message", text.slice(0, 80), "integration");
      return res.json({ success: true });
    }

    // ─── Zoom ─────────────────────────────────────────────────────────────────
    if (r0 === "zoom") {
      if (r1 === "auth" && method === "GET") {
        const workspaceId = Number(req.query.workspace_id || 1);
        const clientId = process.env.ZOOM_CLIENT_ID;
        const redirectUri = process.env.ZOOM_REDIRECT_URI || `https://${req.headers.host}/api/zoom/callback`;
        if (!clientId) return res.status(500).json({ error: "ZOOM_CLIENT_ID not configured" });
        return res.redirect(`https://zoom.us/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${workspaceId}`);
      }
      if (r1 === "callback" && method === "GET") {
        const { code, state, error } = req.query;
        if (error || !code) return res.redirect("/?zoom=error");
        const workspaceId = Number(state || 1);
        const clientId = process.env.ZOOM_CLIENT_ID;
        const clientSecret = process.env.ZOOM_CLIENT_SECRET;
        const redirectUri = process.env.ZOOM_REDIRECT_URI || `https://${req.headers.host}/api/zoom/callback`;
        if (!clientId || !clientSecret) return res.redirect("/?zoom=error");
        try {
          const tokenResp = await fetch("https://zoom.us/oauth/token", {
            method: "POST",
            headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: "authorization_code", code: String(code), redirect_uri: redirectUri }),
          });
          if (!tokenResp.ok) return res.redirect("/?zoom=error");
          const tokenData = (await tokenResp.json()) as any;
          const userResp = await fetch("https://api.zoom.us/v2/users/me", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
          const userData = userResp.ok ? ((await userResp.json()) as any) : {};
          const expiresAt = Date.now() + tokenData.expires_in * 1000;
          await supabase.from("zoom_tokens").upsert({ workspace_id: workspaceId, access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_at: expiresAt, zoom_user_id: userData.id || "", zoom_email: userData.email || "" }, { onConflict: "workspace_id" });
          await logActivity(1, "Connected Zoom account", userData.email || "", "integration");
          return res.redirect("/?zoom=connected");
        } catch { return res.redirect("/?zoom=error"); }
      }
      if (r1 === "status" && method === "GET") {
        const workspaceId = Number(req.query.workspace_id || 0);
        if (!workspaceId) return res.status(400).json({ error: "workspace_id required" });
        const { data } = await supabase.from("zoom_tokens").select("zoom_email").eq("workspace_id", workspaceId).maybeSingle();
        return res.json(data ? { connected: true, email: data.zoom_email } : { connected: false });
      }
      if (r1 === "meetings") {
        const workspaceId = Number(req.query.workspace_id || req.body?.workspace_id || 0);
        if (!workspaceId) return res.status(400).json({ error: "workspace_id required" });
        const token = await getZoomAccessToken(workspaceId);
        if (!token) return res.status(401).json({ error: "Zoom not connected", connected: false });
        if (method === "GET") {
          const resp = await fetch("https://api.zoom.us/v2/users/me/meetings?type=upcoming&page_size=10", { headers: { Authorization: `Bearer ${token}` } });
          if (!resp.ok) return res.status(resp.status).json({ error: "Zoom API error" });
          const data = (await resp.json()) as any;
          return res.json(data.meetings || []);
        }
        if (method === "POST") {
          const { topic, start_time, duration = 60, agenda = "" } = req.body;
          if (!topic || !start_time) return res.status(400).json({ error: "topic, start_time required" });
          const resp = await fetch("https://api.zoom.us/v2/users/me/meetings", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ topic, type: 2, start_time, duration: Number(duration), agenda, settings: { host_video: true, participant_video: true, join_before_host: true } }),
          });
          if (!resp.ok) { const e = await resp.json(); return res.status(resp.status).json({ error: "Zoom API error", details: e }); }
          const meeting = (await resp.json()) as any;
          await logActivity(1, `Scheduled Zoom meeting: ${topic}`, meeting.join_url, "integration");
          return res.json(meeting);
        }
      }
      if (r1 === "disconnect" && method === "DELETE") {
        const workspaceId = Number(req.query.workspace_id || 0);
        if (!workspaceId) return res.status(400).json({ error: "workspace_id required" });
        await supabase.from("zoom_tokens").delete().eq("workspace_id", workspaceId);
        await logActivity(1, "Disconnected Zoom", "", "integration");
        return res.json({ success: true });
      }
    }

    // ─── AI ───────────────────────────────────────────────────────────────────
    if (r0 === "ai") {
      if (r1 === "providers") {
        if (method === "GET") {
          const { data } = await supabase.from("global_settings").select("ai_provider").eq("id", 1).maybeSingle();
          const active = data?.ai_provider || process.env.AI_PROVIDER || "groq";
          const list = [
            { id: "claude",   name: "Claude (Anthropic)", model: "claude-sonnet-4-6",       available: !!process.env.ANTHROPIC_API_KEY },
            { id: "groq",     name: "Groq (Llama 3.3)",   model: "llama-3.3-70b-versatile", available: !!process.env.GROQ_API_KEY },
            { id: "gemini",   name: "Gemini (Google)",     model: "gemini-1.5-flash",        available: !!process.env.GEMINI_API_KEY },
            { id: "deepseek", name: "DeepSeek",            model: "deepseek-chat",           available: !!process.env.DEEPSEEK_API_KEY },
          ];
          return res.json({ active, providers: list });
        }
        if (method === "POST") {
          const { provider } = req.body;
          const valid = ["claude", "groq", "gemini", "deepseek"];
          if (!valid.includes(provider)) return res.status(400).json({ error: "Invalid provider" });
          await supabase.from("global_settings").upsert({ id: 1, ai_provider: provider }, { onConflict: "id" });
          return res.json({ active: provider });
        }
      }
      if (!r1 && method === "POST") {
        const { messages } = req.body;
        if (!Array.isArray(messages) || messages.length === 0)
          return res.status(400).json({ error: "messages array is required" });
        const { data: settings } = await supabase.from("global_settings").select("ai_provider").eq("id", 1).maybeSingle();
        const provider = settings?.ai_provider || process.env.AI_PROVIDER || "groq";
        const today = new Date().toISOString().split("T")[0];
        const [{ data: dealsData }, { data: tasksRaw }, { data: kbData }] = await Promise.all([
          supabase.from("deals").select("title, value, stage, risk_score, contacts(name)").order("created_at", { ascending: false }).limit(10),
          supabase.from("tasks").select("title, status, priority, due_date, users!assignee_id(name)").neq("status", "Completed").order("due_date").limit(15),
          supabase.from("knowledge_base").select("title, content, category"),
        ]);
        const d = dealsData || [];
        const t = (tasksRaw || []).map((x: any) => ({ ...x, assignee: x.users?.name || "Unassigned" }));
        const kb = kbData || [];
        const pipelineValue = d.reduce((s: number, x: any) => s + (x.value || 0), 0);
        const wonDeals = d.filter((x: any) => x.stage === "Won").length;
        const closedDeals = d.filter((x: any) => ["Won", "Lost"].includes(x.stage)).length;
        const winRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;
        const overdueTasks = t.filter((x: any) => x.due_date && x.due_date < today);
        const systemPrompt = `You are EIDEN AI, an intelligent CRM assistant for Eiden Group — a growth engineering and revenue architecture firm.
Your role: Help employees manage their work, monitor tasks, analyze deals, track pipeline health, and make smart decisions. Be concise, professional, and data-driven.
## LIVE CRM DATA (Today: ${today})
**Pipeline:** $${pipelineValue.toLocaleString()} total value
**Active Deals:** ${d.filter((x: any) => !["Won","Lost"].includes(x.stage)).length} | **Win Rate:** ${winRate}%
**Overdue Tasks:** ${overdueTasks.length}
**ACTIVE TASKS (${t.length}):**
${t.map((x: any) => `- [${x.priority}${x.due_date < today ? " OVERDUE" : ""}] ${x.title} → ${x.assignee} (due: ${x.due_date}, ${x.status})`).join("\n") || "None"}
**RECENT DEALS:**
${d.map((x: any) => `- ${x.title}: $${(x.value || 0).toLocaleString()} [${x.stage}] risk:${x.risk_score}% contact:${(x.contacts as any)?.name || "N/A"}`).join("\n") || "None"}
**KNOWLEDGE BASE:**
${kb.map((k: any) => `[${k.category}] ${k.title}: ${k.content.slice(0, 120)}...`).join("\n")}
## CAPABILITIES
When a user wants to create or update data, respond with a JSON action block:
{"action":"create_task","data":{"title":"...","assignee":"...","due_date":"YYYY-MM-DD","priority":"High|Medium|Low","description":"..."}}
{"action":"create_deal","data":{"title":"...","value":0,"stage":"Lead|Proposal|Negotiation"}}
## GUIDELINES
- Be concise, highlight overdue tasks and high-risk deals proactively
- For briefings, use bullet points
- Always ground analysis in the actual data provided above`;
        try {
          const text = await sendToAI(systemPrompt, messages.map((m: any) => ({ role: m.role, content: String(m.content) })), provider);
          return res.json({ text });
        } catch (err: any) {
          return res.status(500).json({ error: "AI request failed", details: err.message });
        }
      }
    }

    // ─── Seed ─────────────────────────────────────────────────────────────────
    if (r0 === "seed" && method === "POST") {
      const { count } = await supabase.from("users").select("*", { count: "exact", head: true });
      if (count && count > 0) return res.json({ message: "Already seeded", skipped: true });
      const { data: ws } = await supabase.from("workspaces").insert({ name: "Eiden Group" }).select().single();
      const defaultPass = await bcrypt.hash("admin123", 10);
      const wsId = ws?.id;
      await supabase.from("users").insert([
        { name: "Oualid Laati",       email: "oualid@eiden.group",     role: "Admin",               workspace_id: wsId, username: "oualid",      password: defaultPass },
        { name: "Najlaa Zkaili",      email: "najlaa@eiden.group",     role: "Operational Manager", workspace_id: wsId, username: "najlaa",      password: defaultPass },
        { name: "Hassan Elkhadiri",   email: "hassan@eiden.group",     role: "Brand Manager",       workspace_id: wsId, username: "hassan",      password: defaultPass },
        { name: "Maryam Ha",          email: "maryam@eiden.group",     role: "Marketing Strategy",  workspace_id: wsId, username: "maryam",      password: defaultPass },
        { name: "Abdelhakim Akhidar", email: "abdelhakim@eiden.group", role: "Web / IT Developer",  workspace_id: wsId, username: "abdelhakim",  password: defaultPass },
      ]);
      await supabase.from("activity_log").insert({ user_id: null, action: "System initialized", related_to: "Eiden AI CRM", type: "system" });
      return res.json({ message: "Seeded successfully", workspace_id: wsId });
    }

    res.status(404).json({ error: "Not found" });
  } catch (err: any) {
    console.error("API error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
}
