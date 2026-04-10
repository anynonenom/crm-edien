import express from "express";
import http from "http";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { WebSocketServer, WebSocket } from "ws";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── AI Provider ──────────────────────────────────────────────────────────────
let aiProvider: string = process.env.AI_PROVIDER || "groq";

async function sendToAI(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  switch (aiProvider) {
    case "claude": {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 1024, system: systemPrompt,
        messages: messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content }))
      });
      const c = resp.content[0];
      return c.type === "text" ? c.text : "Unable to generate response.";
    }
    case "groq":
    case "deepseek": {
      const isGroq = aiProvider === "groq";
      const baseUrl = isGroq ? "https://api.groq.com/openai/v1" : "https://api.deepseek.com/v1";
      const apiKey = isGroq ? process.env.GROQ_API_KEY : process.env.DEEPSEEK_API_KEY;
      const model = isGroq ? "llama-3.3-70b-versatile" : "deepseek-chat";
      if (!apiKey) throw new Error(`${aiProvider.toUpperCase()}_API_KEY not set`);
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, ...messages] })
      });
      const data = await resp.json() as any;
      if (!resp.ok) throw new Error(data.error?.message || "API error");
      return data.choices[0].message.content;
    }
    case "gemini": {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY not set");
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          systemInstruction: { parts: [{ text: systemPrompt }] }
        })
      });
      const data = await resp.json() as any;
      if (!resp.ok) throw new Error(data.error?.message || "Gemini API error");
      return data.candidates[0].content.parts[0].text;
    }
    default:
      throw new Error(`Unknown AI provider: ${aiProvider}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function logActivity(userId: number, action: string, relatedTo: string, type: string) {
  try {
    await supabase.from("activity_log").insert({ user_id: userId, action, related_to: relatedTo, type });
  } catch {}
}

// ─── Zoom OAuth Helper ────────────────────────────────────────────────────────
async function getZoomAccessToken(workspaceId: number): Promise<string | null> {
  const { data: row } = await supabase.from("zoom_tokens").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (!row) return null;
  if (Date.now() < row.expires_at - 60000) return row.access_token;

  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const resp = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: row.refresh_token })
    });
    if (!resp.ok) {
      await supabase.from("zoom_tokens").delete().eq("workspace_id", workspaceId);
      return null;
    }
    const data = await resp.json() as any;
    const expiresAt = Date.now() + (data.expires_in * 1000);
    await supabase.from("zoom_tokens").update({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expiresAt }).eq("workspace_id", workspaceId);
    return data.access_token;
  } catch { return null; }
}

// ─── Server ───────────────────────────────────────────────────────────────────
async function startServer() {

  // ─── Seed (only if DB is empty) ───────────────────────────────────────────
  const { count } = await supabase.from("users").select("*", { count: "exact", head: true });
  if (!count || count === 0) {
    const { data: ws } = await supabase.from("workspaces").insert({ name: "Eiden Group" }).select().single();
    const defaultPass = await bcrypt.hash("admin123", 10);
    const wsId = ws?.id;

    await supabase.from("users").insert([
      { name: "Oualid Laati",       email: "oualid@eiden.group",      role: "Admin",               workspace_id: wsId, username: "oualid",      password: defaultPass },
      { name: "Najlaa Zkaili",      email: "najlaa@eiden.group",      role: "Operational Manager", workspace_id: wsId, username: "najlaa",      password: defaultPass },
      { name: "Hassan Elkhadiri",   email: "hassan@eiden.group",      role: "Brand Manager",       workspace_id: wsId, username: "hassan",      password: defaultPass },
      { name: "Maryam Ha",          email: "maryam@eiden.group",      role: "Marketing Strategy",  workspace_id: wsId, username: "maryam",      password: defaultPass },
      { name: "Abdelhakim Akhidar", email: "abdelhakim@eiden.group",  role: "Web / IT Developer",  workspace_id: wsId, username: "abdelhakim",  password: defaultPass },
    ]);
    await logActivity(1, "System initialized", "Eiden AI CRM", "system");
    console.log("  DB: ✓ Seeded Supabase with default workspace + team");
  }

  const app = express();
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  const wsRooms = new Map<number, Set<WebSocket>>();

  const joinRoom = (workspaceId: number, ws: WebSocket) => {
    if (!wsRooms.has(workspaceId)) wsRooms.set(workspaceId, new Set());
    wsRooms.get(workspaceId)!.add(ws);
  };
  const leaveAllRooms = (ws: WebSocket) => { for (const room of wsRooms.values()) room.delete(ws); };
  const broadcastToWorkspace = (workspaceId: number, payload: any) => {
    const room = wsRooms.get(workspaceId);
    if (!room) return;
    const data = JSON.stringify(payload);
    for (const client of room) { if (client.readyState === WebSocket.OPEN) client.send(data); }
  };

  wss.on("connection", (ws, req) => {
    try {
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const workspaceId = Number(url.searchParams.get("workspace_id") || 0);
      if (!workspaceId) { ws.close(); return; }
      joinRoom(workspaceId, ws);

      ws.on("message", async (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg?.type !== "chat_message") return;
          const { workspace_id, user_id, user_name, text } = msg;
          const wid = Number(workspace_id || workspaceId);
          const name = String(user_name || "").trim();
          const content = String(text || "").trim();
          if (!wid || !name || !content) return;

          const { data: inserted } = await supabase.from("chat_messages")
            .insert({ workspace_id: wid, user_id: user_id || null, user_name: name, message: content })
            .select().single();

          if (inserted) {
            broadcastToWorkspace(wid, {
              type: "chat_message",
              data: { id: inserted.id, user: inserted.user_name, text: inserted.message, created_at: inserted.created_at }
            });
          }
        } catch (err) { console.error("WS message error:", err); }
      });

      ws.on("close", () => leaveAllRooms(ws));
      ws.on("error", () => leaveAllRooms(ws));
    } catch (err) { console.error("WS connection error:", err); ws.close(); }
  });

  // ─── Stats ──────────────────────────────────────────────────────────────────
  app.get("/api/stats", async (_req, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const [{ data: deals }, { data: contacts }, { data: tasks }] = await Promise.all([
        supabase.from("deals").select("value, stage"),
        supabase.from("contacts").select("status"),
        supabase.from("tasks").select("status, due_date"),
      ]);
      const d = deals || []; const c = contacts || []; const t = tasks || [];
      const pipelineValue = d.reduce((s: number, x: any) => s + (x.value || 0), 0);
      const activeDeals = d.filter((x: any) => !["Won","Lost"].includes(x.stage)).length;
      const wonDeals = d.filter((x: any) => x.stage === "Won").length;
      const closedDeals = d.filter((x: any) => ["Won","Lost"].includes(x.stage)).length;
      const winRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;
      const activeClients = c.filter((x: any) => x.status === "Active").length;
      const overdueTasks = t.filter((x: any) => x.status !== "Completed" && x.due_date && x.due_date < today).length;
      res.json({ pipelineValue, activeDeals, winRate: `${winRate}%`, activeClients, overdueTasks });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Deals ──────────────────────────────────────────────────────────────────
  app.get("/api/deals", async (_req, res) => {
    try {
      const { data } = await supabase.from("deals").select("*, contacts(name)").order("created_at", { ascending: false });
      res.json((data || []).map((d: any) => ({ ...d, contact_name: d.contacts?.name || "" })));
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/deals", async (req, res) => {
    const { title, value, stage, contact_id, workspace_id, risk_score, win_probability, notes } = req.body;
    try {
      const { data } = await supabase.from("deals").insert({ title, value, stage, contact_id, workspace_id, risk_score, win_probability, notes }).select().single();
      await logActivity(1, `Created deal: ${title}`, title, "deal");
      res.json({ id: data?.id });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/deals/:id", async (req, res) => {
    const { id } = req.params;
    const { title, value, stage, risk_score, win_probability, notes, contact_id } = req.body;
    try {
      await supabase.from("deals").update({ title, value, stage, risk_score, win_probability, notes, contact_id }).eq("id", id);
      if (stage) await logActivity(1, `Updated deal stage to ${stage}`, String(id), "deal");
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/deals/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await supabase.from("deals").delete().eq("id", id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Contacts ────────────────────────────────────────────────────────────────
  app.get("/api/contacts", async (_req, res) => {
    try {
      const { data } = await supabase.from("contacts").select("*").order("created_at", { ascending: false });
      res.json(data || []);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/contacts", async (req, res) => {
    const { name, company, email, phone, status, source, ltv, notes, workspace_id } = req.body;
    try {
      const { data } = await supabase.from("contacts").insert({ name, company, email, phone, status, source, ltv, notes, workspace_id }).select().single();
      await logActivity(1, `Added contact: ${name}`, name, "contact");
      res.json({ id: data?.id });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    const { id } = req.params;
    const { name, company, email, phone, status, source, ltv, notes } = req.body;
    try {
      await supabase.from("contacts").update({ name, company, email, phone, status, source, ltv, notes }).eq("id", id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/contacts/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await supabase.from("contacts").delete().eq("id", id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Tasks ───────────────────────────────────────────────────────────────────
  app.get("/api/tasks", async (_req, res) => {
    try {
      const { data } = await supabase.from("tasks")
        .select("*, users!assignee_id(name), deals!related_deal_id(title)")
        .order("due_date", { ascending: true });
      res.json((data || []).map((t: any) => ({
        ...t,
        assignee_name: t.users?.name || "",
        deal_title: t.deals?.title || ""
      })));
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/tasks", async (req, res) => {
    const { title, description, assignee_id, related_deal_id, workspace_id, due_date, status, priority } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });
    try {
      const { data, error } = await supabase.from("tasks").insert({ title, description, assignee_id: assignee_id || null, related_deal_id: related_deal_id || null, workspace_id: workspace_id || null, due_date, status: status || "Pending", priority: priority || "Medium" }).select().single();
      if (error) { console.error("Task insert error:", error); return res.status(500).json({ error: error.message }); }
      await logActivity(assignee_id || 1, `Created task: ${title}`, title, "task");
      res.json({ id: data?.id });
    } catch (e: any) { console.error("Task POST error:", e); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    const { id } = req.params;
    const { title, description, assignee_id, related_deal_id, due_date, status, priority } = req.body;
    try {
      await supabase.from("tasks").update({ title, description, assignee_id, related_deal_id, due_date, status, priority }).eq("id", id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await supabase.from("tasks").delete().eq("id", id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Users ───────────────────────────────────────────────────────────────────
  app.get("/api/users", async (_req, res) => {
    try {
      const { data } = await supabase.from("users").select("id, name, role, workspace_id, email, username");
      res.json(data || []);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/users/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });
    try {
      const { data: user } = await supabase.from("users").select("*")
        .or(`username.eq.${username},email.eq.${username}`)
        .maybeSingle();
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: "Invalid credentials" });
      await logActivity(user.id, "Logged in", user.name, "auth");
      res.json({ id: user.id, name: user.name, role: user.role, workspace_id: user.workspace_id });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/users/register", async (req, res) => {
    const { name, email, username, password, company_name } = req.body;
    if (!name || !email || !username || !password || !company_name) return res.status(400).json({ error: "Missing required fields" });
    try {
      const { data: exists } = await supabase.from("users").select("id").or(`username.eq.${username},email.eq.${email}`).maybeSingle();
      if (exists) return res.status(409).json({ error: "Username or email already taken" });
      const { data: existingWs } = await supabase.from("workspaces").select("id, name").ilike("name", company_name).maybeSingle();
      let workspace_id: number;
      let role: string;
      if (existingWs) {
        workspace_id = existingWs.id;
        role = "Commercial";
      } else {
        const { data: newWs } = await supabase.from("workspaces").insert({ name: company_name }).select().single();
        workspace_id = newWs!.id;
        role = "Admin";
      }
      const hashed = await bcrypt.hash(password, 10);
      const { data } = await supabase.from("users").insert({ name, email, username, password: hashed, role, workspace_id }).select().single();
      await logActivity(data?.id, `Registered: ${name}`, `${company_name} (${role})`, "auth");
      res.json({ id: data?.id, role, workspace_id });
    } catch (err) { console.error("Register error:", err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/users/:id", async (req, res) => {
    const { id } = req.params;
    const { name, email, role, workspace_id, password } = req.body;
    try {
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email;
      if (role !== undefined) updates.role = role;
      if (workspace_id !== undefined) updates.workspace_id = Number(workspace_id);
      if (password !== undefined && password.trim().length >= 6) updates.password = await bcrypt.hash(password, 10);
      await supabase.from("users").update(updates).eq("id", id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Workspaces ──────────────────────────────────────────────────────────────
  app.get("/api/workspaces", async (_req, res) => {
    try {
      const { data } = await supabase.from("workspaces").select("*");
      res.json(data || []);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Activity ────────────────────────────────────────────────────────────────
  app.get("/api/activity", async (_req, res) => {
    try {
      const { data } = await supabase.from("activity_log")
        .select("*, users(name)")
        .order("timestamp", { ascending: false })
        .limit(50);
      res.json((data || []).map((a: any) => ({
        id: a.id,
        user_name: a.users?.name || "System",
        action: a.action,
        related_to: a.related_to,
        type: a.type,
        time: a.timestamp
      })));
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Knowledge Base ──────────────────────────────────────────────────────────
  app.get("/api/knowledge", async (_req, res) => {
    try {
      const { data } = await supabase.from("knowledge_base").select("*").order("category");
      res.json(data || []);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/knowledge", async (req, res) => {
    const { title, content, category } = req.body;
    try {
      const { data } = await supabase.from("knowledge_base").insert({ title, content, category }).select().single();
      res.json({ id: data?.id });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/knowledge/:id", async (req, res) => {
    const { id } = req.params;
    const { title, content, category } = req.body;
    try {
      await supabase.from("knowledge_base").update({ title, content, category, updated_at: new Date().toISOString() }).eq("id", id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Financials ───────────────────────────────────────────────────────────────
  app.get("/api/financials", async (_req, res) => {
    try {
      const { data: deals } = await supabase.from("deals").select("value, stage, created_at");
      const d = deals || [];
      const totalRevenue = d.filter((x: any) => x.stage === "Won").reduce((s: number, x: any) => s + (x.value || 0), 0);
      const pendingRevenue = d.filter((x: any) => !["Won","Lost"].includes(x.stage)).reduce((s: number, x: any) => s + (x.value || 0), 0);
      const monthMap: Record<string, number> = {};
      d.filter((x: any) => x.stage === "Won").forEach((x: any) => {
        const month = (x.created_at || "").slice(0, 7);
        if (month) monthMap[month] = (monthMap[month] || 0) + (x.value || 0);
      });
      const monthly = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([month, total]) => ({ month, total }));
      res.json({ totalRevenue, pendingRevenue, monthly });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Search ─────────────────────────────────────────────────────────────────
  app.get("/api/search", async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json([]);
    try {
      const like = `%${q}%`;
      const [{ data: d }, { data: c }, { data: t }] = await Promise.all([
        supabase.from("deals").select("id, title, stage").ilike("title", like).limit(10),
        supabase.from("contacts").select("id, name, company").or(`name.ilike.${like},company.ilike.${like}`).limit(10),
        supabase.from("tasks").select("id, title, status").ilike("title", like).limit(10),
      ]);
      res.json([
        ...(d || []).map((x: any) => ({ ...x, name: x.title, type: "deal" })),
        ...(c || []).map((x: any) => ({ ...x, type: "contact" })),
        ...(t || []).map((x: any) => ({ ...x, name: x.title, type: "task" })),
      ]);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Chat ────────────────────────────────────────────────────────────────────
  app.get("/api/chat", async (req, res) => {
    const workspaceId = Number(req.query.workspace_id || 0);
    if (!workspaceId) return res.status(400).json({ error: "workspace_id is required" });
    try {
      const { data } = await supabase.from("chat_messages")
        .select("id, user_name, message, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .limit(200);
      res.json((data || []).map((r: any) => ({ id: r.id, user: r.user_name, text: r.message, created_at: r.created_at })));
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/chat", async (req, res) => {
    const { workspace_id, user_id, user_name, text } = req.body || {};
    const wid = Number(workspace_id);
    const name = String(user_name || "").trim();
    const content = String(text || "").trim();
    if (!wid || !name || !content) return res.status(400).json({ error: "Missing fields" });
    try {
      const { data } = await supabase.from("chat_messages")
        .insert({ workspace_id: wid, user_id: user_id || null, user_name: name, message: content })
        .select().single();
      broadcastToWorkspace(wid, { type: "chat_message", data: { id: data?.id, user: name, text: content, created_at: data?.created_at } });
      res.json({ id: data?.id });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Workspace Settings ───────────────────────────────────────────────────────
  app.get("/api/workspace-settings/:id", async (req, res) => {
    const wid = Number(req.params.id);
    if (!wid) return res.status(400).json({ error: "workspace_id required" });
    try {
      const { data } = await supabase.from("workspace_settings").select("meeting_link").eq("workspace_id", wid).maybeSingle();
      res.json({ meeting_link: data?.meeting_link || "" });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/workspace-settings/:id", async (req, res) => {
    const wid = Number(req.params.id);
    const { meeting_link } = req.body || {};
    if (!wid) return res.status(400).json({ error: "workspace_id required" });
    try {
      await supabase.from("workspace_settings").upsert(
        { workspace_id: wid, meeting_link: String(meeting_link || ""), updated_at: new Date().toISOString() },
        { onConflict: "workspace_id" }
      );
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Admin — Workspace Management ────────────────────────────────────────────
  app.post("/api/workspaces", async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Workspace name required" });
    try {
      const { data } = await supabase.from("workspaces").insert({ name }).select().single();
      await logActivity(1, `Created workspace: ${name}`, name, "system");
      res.json(data);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/workspaces/:id", async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
      await supabase.from("workspaces").update({ name }).eq("id", id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/workspaces/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await supabase.from("chat_messages").delete().eq("workspace_id", id);
      await supabase.from("workspace_settings").delete().eq("workspace_id", id);
      await supabase.from("zoom_tokens").delete().eq("workspace_id", id);
      await supabase.from("tasks").delete().eq("workspace_id", id);
      await supabase.from("deals").delete().eq("workspace_id", id);
      await supabase.from("contacts").delete().eq("workspace_id", id);
      await supabase.from("users").update({ workspace_id: null }).eq("workspace_id", id);
      await supabase.from("workspaces").delete().eq("id", id);
      await logActivity(1, `Deleted workspace #${id}`, "", "system");
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Admin — User Management ──────────────────────────────────────────────────
  app.delete("/api/users/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await supabase.from("tasks").update({ assignee_id: null }).eq("assignee_id", id);
      await supabase.from("activity_log").update({ user_id: null }).eq("user_id", id);
      await supabase.from("chat_messages").update({ user_id: null }).eq("user_id", id);
      await supabase.from("users").delete().eq("id", id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Admin — Overview ─────────────────────────────────────────────────────────
  app.get("/api/admin/overview", async (_req, res) => {
    try {
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
      res.json({ workspaces, users: allUsers || [] });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Slack Integration ────────────────────────────────────────────────────────
  app.post("/api/integrations/slack/message", async (req, res) => {
    const { text } = req.body;
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return res.status(500).json({ error: "SLACK_WEBHOOK_URL not configured" });
    if (!text) return res.status(400).json({ error: "text is required" });
    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!resp.ok) return res.status(502).json({ error: "Slack webhook failed" });
      await logActivity(1, "Sent Slack message", text.slice(0, 80), "integration");
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Zoom OAuth ───────────────────────────────────────────────────────────────
  app.get("/api/zoom/auth", (req, res) => {
    const workspaceId = Number(req.query.workspace_id || 1);
    const clientId = process.env.ZOOM_CLIENT_ID;
    const redirectUri = process.env.ZOOM_REDIRECT_URI || "http://localhost:3000/api/zoom/callback";
    if (!clientId) return res.status(500).json({ error: "ZOOM_CLIENT_ID not configured in .env" });
    const url = `https://zoom.us/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${workspaceId}`;
    res.redirect(url);
  });

  app.get("/api/zoom/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error || !code) return res.redirect("/?zoom=error");
    const workspaceId = Number(state || 1);
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    const redirectUri = process.env.ZOOM_REDIRECT_URI || "http://localhost:3000/api/zoom/callback";
    if (!clientId || !clientSecret) return res.redirect("/?zoom=error");
    try {
      const tokenResp = await fetch("https://zoom.us/oauth/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ grant_type: "authorization_code", code: String(code), redirect_uri: redirectUri })
      });
      if (!tokenResp.ok) return res.redirect("/?zoom=error");
      const tokenData = await tokenResp.json() as any;
      const userResp = await fetch("https://api.zoom.us/v2/users/me", {
        headers: { "Authorization": `Bearer ${tokenData.access_token}` }
      });
      const userData = userResp.ok ? await userResp.json() as any : {};
      const expiresAt = Date.now() + (tokenData.expires_in * 1000);
      await supabase.from("zoom_tokens").upsert({
        workspace_id: workspaceId, access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token, expires_at: expiresAt,
        zoom_user_id: userData.id || "", zoom_email: userData.email || ""
      }, { onConflict: "workspace_id" });
      await logActivity(1, "Connected Zoom account", userData.email || "", "integration");
      res.redirect("/?zoom=connected");
    } catch (err) { console.error("Zoom callback error:", err); res.redirect("/?zoom=error"); }
  });

  app.get("/api/zoom/status", async (req, res) => {
    const workspaceId = Number(req.query.workspace_id || 0);
    if (!workspaceId) return res.status(400).json({ error: "workspace_id required" });
    try {
      const { data } = await supabase.from("zoom_tokens").select("zoom_email").eq("workspace_id", workspaceId).maybeSingle();
      if (!data) return res.json({ connected: false });
      res.json({ connected: true, email: data.zoom_email });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/zoom/meetings", async (req, res) => {
    const workspaceId = Number(req.query.workspace_id || 0);
    if (!workspaceId) return res.status(400).json({ error: "workspace_id required" });
    const token = await getZoomAccessToken(workspaceId);
    if (!token) return res.status(401).json({ error: "Zoom not connected", connected: false });
    try {
      const resp = await fetch("https://api.zoom.us/v2/users/me/meetings?type=upcoming&page_size=10", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!resp.ok) return res.status(resp.status).json({ error: "Zoom API error" });
      const data = await resp.json() as any;
      res.json(data.meetings || []);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/zoom/meetings", async (req, res) => {
    const { workspace_id, topic, start_time, duration = 60, agenda = "" } = req.body;
    const workspaceId = Number(workspace_id || 0);
    if (!workspaceId || !topic || !start_time) return res.status(400).json({ error: "workspace_id, topic, start_time required" });
    const token = await getZoomAccessToken(workspaceId);
    if (!token) return res.status(401).json({ error: "Zoom not connected" });
    try {
      const resp = await fetch("https://api.zoom.us/v2/users/me/meetings", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ topic, type: 2, start_time, duration: Number(duration), agenda, settings: { host_video: true, participant_video: true, join_before_host: true } })
      });
      if (!resp.ok) { const e = await resp.json(); return res.status(resp.status).json({ error: "Zoom API error", details: e }); }
      const meeting = await resp.json() as any;
      await logActivity(1, `Scheduled Zoom meeting: ${topic}`, meeting.join_url, "integration");
      res.json(meeting);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/zoom/disconnect", async (req, res) => {
    const workspaceId = Number(req.query.workspace_id || 0);
    if (!workspaceId) return res.status(400).json({ error: "workspace_id required" });
    try {
      await supabase.from("zoom_tokens").delete().eq("workspace_id", workspaceId);
      await logActivity(1, "Disconnected Zoom", "", "integration");
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── AI Provider switcher ─────────────────────────────────────────────────────
  app.get("/api/ai/providers", (_req, res) => {
    const list = [
      { id: "claude",   name: "Claude (Anthropic)", model: "claude-sonnet-4-6",        available: !!process.env.ANTHROPIC_API_KEY },
      { id: "groq",     name: "Groq (Llama 3.3)",   model: "llama-3.3-70b-versatile",  available: !!process.env.GROQ_API_KEY },
      { id: "gemini",   name: "Gemini (Google)",     model: "gemini-1.5-flash",         available: !!process.env.GEMINI_API_KEY },
      { id: "deepseek", name: "DeepSeek",            model: "deepseek-chat",            available: !!process.env.DEEPSEEK_API_KEY },
    ];
    res.json({ active: aiProvider, providers: list });
  });

  app.post("/api/ai/provider", (req, res) => {
    const { provider } = req.body;
    const valid = ["claude", "groq", "gemini", "deepseek"];
    if (!valid.includes(provider)) return res.status(400).json({ error: "Invalid provider" });
    aiProvider = provider;
    res.json({ active: aiProvider });
  });

  // ─── AI Assistant ─────────────────────────────────────────────────────────────
  app.post("/api/ai", async (req, res) => {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: "messages array is required" });

    const today = new Date().toISOString().split("T")[0];
    const TASK_CREATOR_ROLES = ["Admin","Eiden HQ","Eiden Global","Operational Manager","Admin Coordinator","Brand Manager","Branding and Strategy Manager","Solution Architect"];
    const [{ data: dealsData }, { data: tasksRaw }, { data: kbData }, { data: usersRaw }] = await Promise.all([
      supabase.from("deals").select("title, value, stage, risk_score, contacts(name)").order("created_at", { ascending: false }).limit(10),
      supabase.from("tasks").select("title, status, priority, due_date, users!assignee_id(name)").neq("status", "Completed").order("due_date").limit(15),
      supabase.from("knowledge_base").select("title, content, category"),
      supabase.from("users").select("name, role"),
    ]);
    const assignableUsers = (usersRaw || []).filter((u: any) => TASK_CREATOR_ROLES.includes(u.role));

    const d = dealsData || [];
    const t = (tasksRaw || []).map((x: any) => ({ ...x, assignee: x.users?.name || "Unassigned" }));
    const kb = kbData || [];
    const pipelineValue = d.reduce((s: number, x: any) => s + (x.value || 0), 0);
    const wonDeals = d.filter((x: any) => x.stage === "Won").length;
    const closedDeals = d.filter((x: any) => ["Won","Lost"].includes(x.stage)).length;
    const winRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;
    const overdueTasks = t.filter((x: any) => x.due_date && x.due_date < today);
    const activeTasks = t;

    const systemPrompt = `You are EIDEN AI, an intelligent CRM assistant for Eiden Group — a growth engineering and revenue architecture firm.

Your role: Help employees manage their work, monitor tasks, analyze deals, track pipeline health, and make smart decisions. Be concise, professional, and data-driven.

## LIVE CRM DATA (Today: ${today})
**Pipeline:** $${pipelineValue.toLocaleString()} total value
**Active Deals:** ${d.filter((x: any) => !["Won","Lost"].includes(x.stage)).length} | **Win Rate:** ${winRate}%
**Overdue Tasks:** ${overdueTasks.length}

**ACTIVE TASKS (${activeTasks.length}):**
${activeTasks.map((t: any) => `- [${t.priority}${t.due_date < today ? " OVERDUE" : ""}] ${t.title} → ${t.assignee} (due: ${t.due_date}, ${t.status})`).join("\n") || "None"}

**RECENT DEALS:**
${d.map((x: any) => `- ${x.title}: $${(x.value || 0).toLocaleString()} [${x.stage}] risk:${x.risk_score}% contact:${(x.contacts as any)?.name || "N/A"}`).join("\n") || "None"}

**KNOWLEDGE BASE:**
${kb.map((k: any) => `[${k.category}] ${k.title}: ${k.content.slice(0, 120)}...`).join("\n")}

## CAPABILITIES
You can interpret natural language to take actions. When a user wants to create or update data, respond with a JSON action block anywhere in your response:

For creating a task (only assign to team members listed in ASSIGNABLE TEAM MEMBERS below):
{"action":"create_task","data":{"title":"...","assignee":"...","due_date":"YYYY-MM-DD","priority":"High|Medium|Low","description":"..."}}

**ASSIGNABLE TEAM MEMBERS (managers/coordinators only):**
${assignableUsers.map((u: any) => `- ${u.name} (${u.role})`).join("\n") || "None available"}

For creating a deal:
{"action":"create_deal","data":{"title":"...","value":0,"stage":"Lead|Proposal|Negotiation"}}

You can include normal text AND an action block in the same response. Example:
"Sure! I'll create that task for you. {"action":"create_task","data":{"title":"Review proposal","assignee":"Sarah Dev","due_date":"2026-03-20","priority":"High"}}"

## GUIDELINES
- Be concise — no lengthy preambles
- Highlight overdue tasks and high-risk deals proactively
- For briefings, use bullet points
- If you don't know something, say so clearly
- Always ground analysis in the actual data provided above`;

    try {
      const text = await sendToAI(systemPrompt, messages.map((m: any) => ({ role: m.role, content: String(m.content) })));
      res.json({ text });
    } catch (err: any) {
      console.error(`AI error [${aiProvider}]:`, err.message);
      res.status(500).json({ error: "AI request failed", details: err.message });
    }
  });

  // ─── Vite Dev / Static ────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 Eiden AI CRM running → http://localhost:${PORT}`);
    console.log(`   AI: ${process.env.ANTHROPIC_API_KEY ? "✓ Claude configured" : "✗ Set ANTHROPIC_API_KEY in .env"}`);
    console.log(`   DB: ${process.env.SUPABASE_URL ? "✓ Supabase connected" : "✗ Set SUPABASE_URL in .env"}\n`);
  });
}

startServer().catch(console.error);
