import express from "express";
import http from "http";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

dotenv.config();

// ─── VAPID / Web Push setup ───────────────────────────────────────────────────
let vapidPublicKey: string;
let vapidPrivateKey: string;

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
} else {
  const keys = webpush.generateVAPIDKeys();
  vapidPublicKey = keys.publicKey;
  vapidPrivateKey = keys.privateKey;
  console.log("\n⚠️  No VAPID keys found in .env — generated ephemeral keys (push won't survive restart).");
  console.log("   Add these to your .env to make push persistent:");
  console.log(`   VAPID_PUBLIC_KEY=${vapidPublicKey}`);
  console.log(`   VAPID_PRIVATE_KEY=${vapidPrivateKey}\n`);
}

webpush.setVapidDetails("mailto:admin@eiden-group.com", vapidPublicKey, vapidPrivateKey);

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

type WorkflowRun = {
  runId: string;
  workflowName: string;
  status: "running" | "completed" | "failed";
  payload: any;
  startedAt: string;
  completedAt?: string;
  error?: string;
};

const workflowRuns = new Map<string, WorkflowRun>();

const toNumberOrNull = (value: any): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const parseActorId = (req: express.Request): number => {
  const headerUserId = toNumberOrNull(req.headers["x-user-id"]);
  const queryUserId = toNumberOrNull(req.query.user_id);
  const bodyUserId = toNumberOrNull((req.body || {}).user_id);
  return headerUserId || queryUserId || bodyUserId || 1;
};

const estimateTokenCount = (text: string): number => {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};

const isMissingColumnError = (error: any): boolean => {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
};

const isMissingRelationError = (error: any): boolean => {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("relation") && msg.includes("does not exist");
};

async function emitEvent(topic: string, payload: any) {
  try {
    await supabase.from("event_log").insert({ topic, payload });
  } catch {
    // Event log table is optional; keep runtime resilient if not migrated yet.
  }
}

async function storeAiUsageLog(args: {
  endpoint: string;
  model: string;
  promptText: string;
  completionText: string;
  userId?: number | null;
}) {
  try {
    await supabase.from("ai_usage_logs").insert({
      endpoint: args.endpoint,
      model: args.model,
      prompt_tokens: estimateTokenCount(args.promptText),
      completion_tokens: estimateTokenCount(args.completionText),
      user_id: args.userId || null,
      cost_micro_usd: 0,
    });
  } catch {
    // ai_usage_logs may not exist yet in older environments.
  }
}

const onboardingStageToProgress = (stage?: string | null): number => {
  const normalized = String(stage || "").toLowerCase().trim();
  if (!normalized) return 0;
  if (normalized.includes("completed")) return 100;
  if (normalized.includes("contract") || normalized.includes("signature")) return 90;
  if (normalized.includes("review")) return 75;
  if (normalized.includes("document")) return 55;
  if (normalized.includes("kyc") || normalized.includes("verification")) return 35;
  if (normalized.includes("negotiation")) return 25;
  if (normalized.includes("new") || normalized.includes("started")) return 10;
  return 50;
};

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
    await logActivity(1, "System initialized", "Eiden AI BMS", "system");
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

  const broadcastToAll = (payload: any) => {
    const data = JSON.stringify(payload);
    for (const room of wsRooms.values()) {
      for (const client of room) { if (client.readyState === WebSocket.OPEN) client.send(data); }
    }
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

  // ─── Clients ─────────────────────────────────────────────────────────────────
  app.get("/api/clients", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error && isMissingRelationError(error)) return res.json([]);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data || []);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/clients", async (req, res) => {
    const {
      name,
      industry,
      status,
      onboarding_stage,
      contact_person,
      contact_email,
      contact_phone,
      monthly_value,
      notes,
      workspace_id,
    } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });
    try {
      const payload = {
        name: String(name).trim(),
        industry: industry || null,
        status: status || "Onboarding",
        onboarding_stage: onboarding_stage || "New",
        contact_person: contact_person || null,
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        monthly_value: Number(monthly_value || 0),
        notes: notes || null,
        workspace_id: toNumberOrNull(workspace_id),
      };
      const { data, error } = await supabase.from("clients").insert(payload).select().single();
      if (error && isMissingRelationError(error)) {
        return res.status(501).json({ error: "clients table is missing. Run supabase_ibms_core_migration.sql first." });
      }
      if (error) return res.status(500).json({ error: error.message });
      await emitEvent("client.created", { client_id: data?.id, workspace_id: payload.workspace_id });
      await logActivity(parseActorId(req), `Created client: ${payload.name}`, payload.name, "client");
      res.json({ id: data?.id });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/clients/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const updates: any = {};
      for (const f of ["name","industry","status","onboarding_stage","contact_person","contact_email","contact_phone","monthly_value","notes","workspace_id"]) {
        if (Object.prototype.hasOwnProperty.call(req.body, f)) updates[f] = req.body[f] ?? null;
      }
      if (updates.monthly_value !== undefined && updates.monthly_value !== null) {
        updates.monthly_value = Number(updates.monthly_value || 0);
      }
      if (updates.name !== undefined && !String(updates.name).trim()) {
        return res.status(400).json({ error: "name cannot be empty" });
      }
      const { error } = await supabase.from("clients").update(updates).eq("id", id);
      if (error && isMissingRelationError(error)) {
        return res.status(501).json({ error: "clients table is missing. Run supabase_ibms_core_migration.sql first." });
      }
      if (error) return res.status(500).json({ error: error.message });
      await emitEvent("client.updated", { client_id: Number(id), changes: Object.keys(updates) });
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/clients/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error && isMissingRelationError(error)) {
        return res.status(501).json({ error: "clients table is missing. Run supabase_ibms_core_migration.sql first." });
      }
      if (error) return res.status(500).json({ error: error.message });
      await emitEvent("client.deleted", { client_id: Number(id) });
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Time Logs ───────────────────────────────────────────────────────────────
  app.get("/api/time-logs", async (req, res) => {
    const workspaceId = toNumberOrNull(req.query.workspace_id);
    try {
      let query = supabase.from("time_logs").select("*").order("created_at", { ascending: false }).limit(500);
      if (workspaceId) query = query.eq("workspace_id", workspaceId);
      const { data, error } = await query;
      if (error && isMissingRelationError(error)) return res.json([]);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data || []);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/time-logs", async (req, res) => {
    const { user_id, user_name, task_id, task_title, start_time, workspace_id, notes } = req.body || {};
    if (!user_id || !user_name || !workspace_id || !start_time) {
      return res.status(400).json({ error: "user_id, user_name, workspace_id, start_time are required" });
    }
    try {
      const payload = {
        user_id: Number(user_id),
        user_name: String(user_name),
        task_id: toNumberOrNull(task_id),
        task_title: task_title || null,
        start_time,
        end_time: null,
        duration_minutes: 0,
        notes: notes || null,
        workspace_id: Number(workspace_id),
      };
      const { data, error } = await supabase.from("time_logs").insert(payload).select("id").single();
      if (error && isMissingRelationError(error)) {
        return res.status(501).json({ error: "time_logs table is missing. Run supabase_ibms_core_migration.sql first." });
      }
      if (error) return res.status(500).json({ error: error.message });
      res.json({ id: data?.id });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/time-logs/:id", async (req, res) => {
    const { id } = req.params;
    const { end_time, duration_minutes, notes } = req.body || {};
    try {
      const updates: any = {};
      if (end_time !== undefined) updates.end_time = end_time;
      if (duration_minutes !== undefined) updates.duration_minutes = Number(duration_minutes || 0);
      if (notes !== undefined) updates.notes = notes;
      const { error } = await supabase.from("time_logs").update(updates).eq("id", id);
      if (error && isMissingRelationError(error)) {
        return res.status(501).json({ error: "time_logs table is missing. Run supabase_ibms_core_migration.sql first." });
      }
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Tasks ───────────────────────────────────────────────────────────────────
  app.get("/api/tasks", async (_req, res) => {
    try {
      const { data: tasks } = await supabase.from("tasks")
        .select("*, users!assignee_id(name), deals!related_deal_id(title)")
        .order("due_date", { ascending: true });
      
      // Fetch subtasks and comments for all tasks
      const taskIds = (tasks || []).map((t: any) => t.id);
      const { data: subtasks } = taskIds.length > 0 ? await supabase.from("task_subtasks").select("*").in("task_id", taskIds) : { data: [] };
      const { data: comments } = taskIds.length > 0 ? await supabase.from("task_comments").select("*, users(name)").in("task_id", taskIds).order("created_at", { ascending: false }) : { data: [] };
      
      // Group subtasks and comments by task_id
      const subtasksByTask = (subtasks || []).reduce((acc: any, s: any) => {
        if (!acc[s.task_id]) acc[s.task_id] = [];
        acc[s.task_id].push(s);
        return acc;
      }, {});
      
      const commentsByTask = (comments || []).reduce((acc: any, c: any) => {
        if (!acc[c.task_id]) acc[c.task_id] = [];
        acc[c.task_id].push({
          ...c,
          user_name: c.users?.name || ""
        });
        return acc;
      }, {});
      
      res.json((tasks || []).map((t: any) => ({
        ...t,
        assignee_name: t.users?.name || "",
        deal_title: t.deals?.title || "",
        subtasks: subtasksByTask[t.id] || [],
        comments: commentsByTask[t.id] || []
      })));
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/tasks", async (req, res) => {
    const { title, description, assignee_id, related_deal_id, workspace_id, due_date, status, priority } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });
    try {
      const effectiveDueDate = due_date || null;
      const effectiveStatus = !effectiveDueDate ? "Pending" : (status || "Pending");
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title,
          description,
          assignee_id: assignee_id || null,
          related_deal_id: related_deal_id || null,
          workspace_id: workspace_id || null,
          due_date: effectiveDueDate,
          status: effectiveStatus,
          priority: priority || "Medium",
        })
        .select()
        .single();
      if (error) { console.error("Task insert error:", error); return res.status(500).json({ error: error.message }); }
      await logActivity(assignee_id || 1, `Created task: ${title}`, title, "task");
      res.json({ id: data?.id });
    } catch (e: any) { console.error("Task POST error:", e); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const updates: any = {};
      for (const f of ["title","description","assignee_id","related_deal_id","due_date","status","priority","overdue_reason","client_id","rejection_reason"]) {
        if (Object.prototype.hasOwnProperty.call(req.body, f)) updates[f] = req.body[f] ?? null;
      }
      const { error } = await supabase.from("tasks").update(updates).eq("id", id);
      if (error) { console.error("Task update error:", error); return res.status(500).json({ error: error.message }); }
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

  // ─── Subtasks ───────────────────────────────────────────────────────────────
  app.get("/api/tasks/:id/subtasks", async (req, res) => {
    const { id } = req.params;
    try {
      const { data } = await supabase.from("task_subtasks").select("*").eq("task_id", id).order("created_at", { ascending: true });
      res.json(data || []);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/tasks/:id/subtasks", async (req, res) => {
    const { id } = req.params;
    const { title, due_date, status } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });
    try {
      // Permission check: only management can add subtasks
      const actorId = parseActorId(req);
      const { data: actor } = await supabase.from("users").select("role").eq("id", actorId).single();

      // Management roles that can add subtasks
      const managementRoles = ["Admin", "Eiden HQ", "Eiden Global", "Operational Manager", "Admin Coordinator", "Brand Manager", "Branding and Strategy Manager", "Solution Architect"];
      const isManagement = actor?.role && managementRoles.includes(actor.role);

      if (!isManagement) {
        return res.status(403).json({ error: "Only management can add subtasks" });
      }

      const { data, error } = await supabase.from("task_subtasks").insert({
        task_id: Number(id),
        title,
        due_date: due_date || null,
        status: status || "Pending"
      }).select().single();
      if (error) { console.error("Subtask insert error:", error); return res.status(500).json({ error: error.message }); }
      res.json({ id: data?.id });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/subtasks/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const updates: any = {};
      for (const f of ["title","due_date","status","rejection_reason"]) {
        if (Object.prototype.hasOwnProperty.call(req.body, f)) updates[f] = req.body[f] ?? null;
      }
      const { error } = await supabase.from("task_subtasks").update(updates).eq("id", id);
      if (error) { console.error("Subtask update error:", error); return res.status(500).json({ error: error.message }); }
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/subtasks/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await supabase.from("task_subtasks").delete().eq("id", id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── Comments ───────────────────────────────────────────────────────────────
  app.get("/api/tasks/:id/comments", async (req, res) => {
    const { id } = req.params;
    try {
      const { data } = await supabase.from("task_comments")
        .select("*, users(name)")
        .eq("task_id", id)
        .order("created_at", { ascending: false });
      res.json((data || []).map((c: any) => ({
        ...c,
        user_name: c.users?.name || ""
      })));
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/tasks/:id/comments", async (req, res) => {
    const { id } = req.params;
    const { content, user_id } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });
    if (!user_id) return res.status(400).json({ error: "User ID is required" });
    try {
      // Permission check: user can only comment on tasks they're assigned to (unless admin or manager)
      const actorId = parseActorId(req);
      const { data: task } = await supabase.from("tasks").select("assignee_id").eq("id", id).single();
      const { data: actor } = await supabase.from("users").select("role").eq("id", actorId).single();

      // Management roles that can comment on any task
      const managementRoles = ["Admin", "Eiden HQ", "Eiden Global", "Operational Manager", "Admin Coordinator", "Brand Manager", "Branding and Strategy Manager", "Solution Architect"];
      const isManagement = actor?.role && managementRoles.includes(actor.role);
      const isAssignee = task?.assignee_id === actorId;

      if (!isManagement && !isAssignee) {
        return res.status(403).json({ error: "You can only comment on tasks assigned to you" });
      }

      const { data, error } = await supabase.from("task_comments").insert({
        task_id: Number(id),
        user_id: Number(user_id),
        content
      }).select().single();
      if (error) { console.error("Comment insert error:", error); return res.status(500).json({ error: error.message }); }
      res.json({ id: data?.id });
    } catch (err) {
      console.error("Comment insert error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/comments/:id", async (req, res) => {
    const { id } = req.params;
    try {
      // Permission check: user can only delete their own comments (unless admin)
      const actorId = parseActorId(req);
      const { data: comment } = await supabase.from("task_comments").select("user_id").eq("id", id).single();
      const { data: actor } = await supabase.from("users").select("role").eq("id", actorId).single();
      
      const isAdmin = actor?.role === "Admin";
      const isOwner = comment?.user_id === actorId;
      
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ error: "You can only delete your own comments" });
      }
      
      await supabase.from("task_comments").delete().eq("id", id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ─── IBMS v1: Clients ───────────────────────────────────────────────────────
  app.get("/api/v1/clients", async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    const workspaceId = toNumberOrNull(req.query.workspace_id);
    const tags = String(req.query.tags || "")
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);
    try {
      let query = supabase
        .from("clients")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(start, end);
      if (workspaceId) query = query.eq("workspace_id", workspaceId);
      const { data, error, count } = await query;
      if (error && isMissingRelationError(error)) {
        return res.json({ page, limit, total: 0, tagFilterApplied: false, items: [] });
      }
      if (error) return res.status(500).json({ error: error.message });

      let items = data || [];
      let tagFilterApplied = false;
      if (tags.length > 0 && items.length > 0) {
        const ids = items.map((c: any) => c.id).filter(Boolean);
        if (ids.length > 0) {
          const { data: tagRows, error: tagError } = await supabase
            .from("client_tags")
            .select("client_id, tag")
            .in("client_id", ids)
            .in("tag", tags);
          if (!tagError) {
            const allowed = new Set((tagRows || []).map((r: any) => r.client_id));
            items = items.filter((c: any) => allowed.has(c.id));
            tagFilterApplied = true;
          }
        }
      }

      res.json({
        page,
        limit,
        total: count ?? items.length,
        tagFilterApplied,
        items,
      });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/v1/clients", async (req, res) => {
    const {
      name,
      legal_name,
      tax_id,
      industry,
      status,
      risk_score,
      custom_fields,
      tags,
      workspace_id,
      onboarding_stage,
      contact_person,
      contact_email,
      contact_phone,
      monthly_value,
      notes,
    } = req.body || {};

    if (!name) return res.status(400).json({ error: "name is required" });

    try {
      const fullPayload = {
        name: String(name).trim(),
        legal_name: legal_name || null,
        tax_id: tax_id || null,
        industry: industry || null,
        status: status || "active",
        risk_score: risk_score === undefined || risk_score === null ? null : Number(risk_score),
        custom_fields: custom_fields && typeof custom_fields === "object" ? custom_fields : {},
        workspace_id: toNumberOrNull(workspace_id),
        onboarding_stage: onboarding_stage || "New",
        contact_person: contact_person || null,
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        monthly_value: Number(monthly_value || 0),
        notes: notes || null,
      };

      let { data, error } = await supabase.from("clients").insert(fullPayload).select().single();
      if (error && isMissingColumnError(error)) {
        const fallbackPayload = {
          name: fullPayload.name,
          industry: fullPayload.industry,
          status: fullPayload.status,
          workspace_id: fullPayload.workspace_id,
          onboarding_stage: fullPayload.onboarding_stage,
          contact_person: fullPayload.contact_person,
          contact_email: fullPayload.contact_email,
          contact_phone: fullPayload.contact_phone,
          monthly_value: fullPayload.monthly_value,
          notes: fullPayload.notes,
        };
        const fallback = await supabase.from("clients").insert(fallbackPayload).select().single();
        data = fallback.data;
        error = fallback.error;
      }
      if (error && isMissingRelationError(error)) {
        return res.status(501).json({ error: "clients table is missing. Run supabase_ibms_core_migration.sql first." });
      }
      if (error) return res.status(500).json({ error: error.message });

      const clientId = data?.id;
      if (clientId && Array.isArray(tags) && tags.length > 0) {
        const tagRows = tags
          .map((t: any) => String(t || "").trim())
          .filter(Boolean)
          .map((tag: string) => ({ client_id: clientId, tag }));
        if (tagRows.length > 0) {
          await supabase.from("client_tags").upsert(tagRows, { onConflict: "client_id,tag" });
        }
      }

      await emitEvent("client.created", { client_id: clientId, workspace_id: fullPayload.workspace_id });
      await logActivity(parseActorId(req), `Created client(v1): ${fullPayload.name}`, fullPayload.name, "client");
      res.json({ id: clientId });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/v1/clients/:id/onboarding/progress", async (req, res) => {
    const clientId = Number(req.params.id);
    if (!clientId) return res.status(400).json({ error: "Invalid client id" });
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, status, onboarding_stage, created_at, updated_at")
        .eq("id", clientId)
        .maybeSingle();
      if (error && isMissingRelationError(error)) {
        return res.status(501).json({ error: "clients table is missing. Run supabase_ibms_core_migration.sql first." });
      }
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: "Client not found" });

      const status = String(data.status || "");
      const progress = /active|completed/i.test(status)
        ? 100
        : onboardingStageToProgress(data.onboarding_stage);

      res.json({
        clientId: data.id,
        clientName: data.name,
        stage: data.onboarding_stage || null,
        status: data.status || null,
        progress,
        updatedAt: data.updated_at || data.created_at || null,
      });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.put("/api/v1/clients/:id/custom-fields", async (req, res) => {
    const clientId = Number(req.params.id);
    const customFields = req.body || {};
    if (!clientId) return res.status(400).json({ error: "Invalid client id" });
    if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) {
      return res.status(400).json({ error: "Body must be a JSON object" });
    }
    try {
      const { error } = await supabase
        .from("clients")
        .update({ custom_fields: customFields, updated_at: new Date().toISOString() })
        .eq("id", clientId);
      if (error && isMissingRelationError(error)) {
        return res.status(501).json({ error: "clients table is missing. Run supabase_ibms_core_migration.sql first." });
      }
      if (error && isMissingColumnError(error)) {
        return res.status(501).json({ error: "custom_fields column is missing. Run the IBMS core migration first." });
      }
      if (error) return res.status(500).json({ error: error.message });
      await emitEvent("client.custom_fields_updated", { client_id: clientId });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  });

  // ─── IBMS v1: Tasks & SLA ───────────────────────────────────────────────────
  app.get("/api/v1/tasks/assigned/me", async (req, res) => {
    const userId = toNumberOrNull(req.query.user_id ?? req.headers["x-user-id"]);
    const status = String(req.query.status || "").trim();
    if (!userId) return res.status(400).json({ error: "user_id is required (query or x-user-id header)" });
    try {
      let query = supabase.from("tasks").select("*").eq("assignee_id", userId).order("due_date", { ascending: true });
      if (status) query = query.ilike("status", status);
      const { data, error } = await query;
      if (error && isMissingRelationError(error)) return res.json([]);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data || []);
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/v1/tasks/:id/complete", async (req, res) => {
    const taskId = Number(req.params.id);
    if (!taskId) return res.status(400).json({ error: "Invalid task id" });
    try {
      const { error } = await supabase.from("tasks").update({ status: "Completed" }).eq("id", taskId);
      if (error && isMissingRelationError(error)) {
        return res.status(501).json({ error: "tasks table is missing. Run supabase_migration.sql first." });
      }
      if (error) return res.status(500).json({ error: error.message });
      await emitEvent("task.completed", { task_id: taskId });
      await logActivity(parseActorId(req), `Completed task #${taskId}`, String(taskId), "task");
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/v1/tasks/:id/escalate", async (req, res) => {
    const taskId = Number(req.params.id);
    if (!taskId) return res.status(400).json({ error: "Invalid task id" });
    try {
      const { error } = await supabase.from("tasks").update({ priority: "High" }).eq("id", taskId);
      if (error && isMissingRelationError(error)) {
        return res.status(501).json({ error: "tasks table is missing. Run supabase_migration.sql first." });
      }
      if (error) return res.status(500).json({ error: error.message });
      await emitEvent("task.escalated", { task_id: taskId, reason: req.body?.reason || null });
      await logActivity(parseActorId(req), `Escalated task #${taskId}`, String(taskId), "task");
      res.json({ success: true, escalated: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  });

  // ─── IBMS v1: Workflows ─────────────────────────────────────────────────────
  app.post("/api/v1/workflows/trigger", async (req, res) => {
    const workflowName = String(req.body?.workflowName || req.body?.name || "").trim();
    const payload = req.body?.payload || {};
    if (!workflowName) return res.status(400).json({ error: "workflowName is required" });

    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const run: WorkflowRun = {
      runId,
      workflowName,
      status: "running",
      payload,
      startedAt,
    };
    workflowRuns.set(runId, run);

    try {
      await supabase.from("workflow_executions").insert({
        id: runId,
        workflow_id: workflowName,
        temporal_run_id: runId,
        status: "running",
        context: payload,
        started_at: startedAt,
      });
    } catch {
      // Keep in-memory fallback when DB workflow table is missing.
    }

    setTimeout(async () => {
      const current = workflowRuns.get(runId);
      if (!current || current.status !== "running") return;
      current.status = "completed";
      current.completedAt = new Date().toISOString();
      workflowRuns.set(runId, current);
      try {
        await supabase
          .from("workflow_executions")
          .update({ status: "completed", completed_at: current.completedAt })
          .eq("id", runId);
      } catch {}
    }, 1500);

    await emitEvent("workflow.triggered", { run_id: runId, workflow_name: workflowName });
    res.json({ runId, workflowName, status: "running", startedAt });
  });

  app.get("/api/v1/workflows/:runId/status", async (req, res) => {
    const runId = String(req.params.runId || "").trim();
    if (!runId) return res.status(400).json({ error: "Invalid runId" });
    try {
      const { data, error } = await supabase
        .from("workflow_executions")
        .select("id, workflow_id, temporal_run_id, status, context, started_at, completed_at")
        .eq("id", runId)
        .maybeSingle();
      if (error && !isMissingRelationError(error)) {
        return res.status(500).json({ error: error.message });
      }
      if (data) {
        return res.json({
          runId: data.id,
          workflowName: data.workflow_id,
          temporalRunId: data.temporal_run_id,
          status: data.status,
          startedAt: data.started_at,
          completedAt: data.completed_at || null,
          context: data.context || {},
        });
      }
    } catch {
      // Fall back to memory map below.
    }

    const inMemory = workflowRuns.get(runId);
    if (!inMemory) return res.status(404).json({ error: "Workflow run not found" });
    res.json({
      runId: inMemory.runId,
      workflowName: inMemory.workflowName,
      status: inMemory.status,
      startedAt: inMemory.startedAt,
      completedAt: inMemory.completedAt || null,
      context: inMemory.payload || {},
      source: "memory",
    });
  });

  // ─── IBMS v1: Billing ───────────────────────────────────────────────────────
  app.post("/api/v1/billing/subscriptions/:clientId/create", async (req, res) => {
    const clientId = Number(req.params.clientId);
    if (!clientId) return res.status(400).json({ error: "Invalid clientId" });

    const now = new Date();
    const nextPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const subscriptionId = `sub_${clientId}_${Date.now()}`;
    const status = String(req.body?.status || "active");

    try {
      let { data, error } = await supabase
        .from("subscriptions")
        .insert({
          client_id: clientId,
          stripe_subscription_id: subscriptionId,
          status,
          current_period_end: nextPeriodEnd,
        })
        .select()
        .single();

      if (error && isMissingColumnError(error)) {
        const fallback = await supabase
          .from("subscriptions")
          .insert({ client_id: clientId, status })
          .select()
          .single();
        data = fallback.data;
        error = fallback.error;
      }
      if (error && isMissingRelationError(error)) {
        return res.status(501).json({ error: "subscriptions table is missing. Run supabase_ibms_core_migration.sql first." });
      }
      if (error) return res.status(500).json({ error: error.message });

      await emitEvent("billing.subscription_created", { client_id: clientId, subscription_id: subscriptionId });
      res.json({
        id: data?.id,
        client_id: clientId,
        stripe_subscription_id: data?.stripe_subscription_id || subscriptionId,
        status: data?.status || status,
        current_period_end: data?.current_period_end || nextPeriodEnd,
      });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/v1/billing/invoices", async (req, res) => {
    const status = String(req.query.status || "").trim();
    try {
      let query = supabase.from("invoices").select("*").order("issued_at", { ascending: false }).limit(200);
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error && isMissingRelationError(error)) return res.json([]);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data || []);
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/v1/billing/webhooks/stripe", async (req, res) => {
    const event = req.body || {};
    const eventType = String(event.type || "").trim();
    const externalInvoiceId = event?.data?.object?.id || req.body?.invoice_id || null;

    try {
      if (eventType === "invoice.payment_succeeded" && externalInvoiceId) {
        const update = await supabase.from("invoices").update({ status: "paid" }).eq("stripe_invoice_id", externalInvoiceId);
        if (update.error && !isMissingRelationError(update.error) && !isMissingColumnError(update.error)) {
          return res.status(500).json({ error: update.error.message });
        }
      } else if (eventType === "invoice.payment_failed" && externalInvoiceId) {
        const update = await supabase.from("invoices").update({ status: "overdue" }).eq("stripe_invoice_id", externalInvoiceId);
        if (update.error && !isMissingRelationError(update.error) && !isMissingColumnError(update.error)) {
          return res.status(500).json({ error: update.error.message });
        }
      }
      await emitEvent("billing.webhook_received", { type: eventType || "unknown", id: event.id || null });
      res.json({ received: true, type: eventType || "unknown" });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
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
      res.json({ id: user.id, name: user.name, role: user.role, workspace_id: user.workspace_id, email: user.email, username: user.username });
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
      if (password !== undefined && String(password).trim().length >= 6) {
        updates.password = await bcrypt.hash(String(password).trim(), 10);
      }
      if (Object.keys(updates).length === 0) return res.json({ success: true });
      const { error } = await supabase.from("users").update(updates).eq("id", Number(id));
      if (error) { console.error("User update error:", error); return res.status(500).json({ error: error.message }); }
      res.json({ success: true });
    } catch (err: any) { console.error("User PATCH error:", err); res.status(500).json({ error: "Server error" }); }
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

  // ─── Push Notifications ───────────────────────────────────────────────────────
  app.get("/api/push/vapid-key", (_req, res) => {
    res.json({ publicKey: vapidPublicKey });
  });

  app.post("/api/push/subscribe", async (req, res) => {
    const { userId, subscription } = req.body;
    if (!userId || !subscription?.endpoint) return res.status(400).json({ error: "Missing data" });
    try {
      await supabase.from("push_subscriptions").upsert({
        user_id: Number(userId),
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh || "",
        auth: subscription.keys?.auth || "",
      }, { onConflict: "user_id,endpoint" });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/push/send-meeting", async (req, res) => {
    const { title = "Team Meeting", message, workspaceId, sentBy } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });
    try {
      // Record in DB
      if (workspaceId) {
        await supabase.from("meeting_alerts").insert({ workspace_id: Number(workspaceId), sent_by: sentBy || null, title, message });
      }
      // Broadcast in-app via WebSocket to ALL connected clients
      broadcastToAll({ type: "meeting_alert", data: { title, message } });
      // Send push to all subscribed devices
      const { data: subs } = await supabase.from("push_subscriptions").select("*");
      let sent = 0;
      for (const sub of subs || []) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: `📅 ${title}`, body: message, icon: "/icon.png", badge: "/icon.png" })
          );
          sent++;
        } catch (e: any) {
          // Remove expired/invalid subscriptions
          if (e.statusCode === 410 || e.statusCode === 404) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      }
      res.json({ success: true, pushed: sent });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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

  // ─── AI Gateway (IBMS Blueprint endpoints) ─────────────────────────────────
  app.post("/api/ai/chat", async (req, res) => {
    const { messages, model, systemPrompt, user_id } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    const normalized = messages
      .map((m: any) => ({
        role: String(m?.role || "user"),
        content: String(m?.content || ""),
      }))
      .filter((m: any) => m.content.trim().length > 0);
    if (normalized.length === 0) return res.status(400).json({ error: "messages must contain content" });

    const selectedModel = String(model || aiProvider);
    const promptText = normalized.map((m: any) => `${m.role}: ${m.content}`).join("\n");
    const started = Date.now();
    try {
      const text = await sendToAI(
        String(systemPrompt || "You are an internal business assistant. Be concise and accurate."),
        normalized
      );
      await storeAiUsageLog({
        endpoint: "/api/ai/chat",
        model: selectedModel,
        promptText,
        completionText: text,
        userId: toNumberOrNull(user_id),
      });
      res.json({
        text,
        model: selectedModel,
        provider: aiProvider,
        latency_ms: Date.now() - started,
      });
    } catch (err: any) {
      res.status(500).json({ error: "AI request failed", details: err?.message || "Unknown error" });
    }
  });

  app.post("/api/ai/extract", async (req, res) => {
    const { documentUrl, fields, text, user_id } = req.body || {};
    if (!documentUrl) return res.status(400).json({ error: "documentUrl is required" });
    if (!Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: "fields array is required" });
    }

    const sourceText = String(text || "");
    const extracted: Record<string, any> = {};
    for (const rawField of fields) {
      const field = String(rawField || "").trim();
      if (!field) continue;
      const lower = field.toLowerCase();
      let value: any = null;
      if (sourceText) {
        if (lower.includes("invoice") && /invoice[\s_:-]*#?\s*([a-z0-9-]+)/i.test(sourceText)) {
          value = sourceText.match(/invoice[\s_:-]*#?\s*([a-z0-9-]+)/i)?.[1] || null;
        } else if ((lower.includes("total") || lower.includes("amount")) && /(?:total|amount)[^\d]{0,10}(\d+(?:[.,]\d{1,2})?)/i.test(sourceText)) {
          value = sourceText.match(/(?:total|amount)[^\d]{0,10}(\d+(?:[.,]\d{1,2})?)/i)?.[1] || null;
        } else if ((lower.includes("vat") || lower.includes("tax")) && /(?:vat|tax)[^\d]{0,10}(\d+(?:[.,]\d{1,2})?)/i.test(sourceText)) {
          value = sourceText.match(/(?:vat|tax)[^\d]{0,10}(\d+(?:[.,]\d{1,2})?)/i)?.[1] || null;
        } else if (lower.includes("date") && /(\d{4}-\d{2}-\d{2})/.test(sourceText)) {
          value = sourceText.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || null;
        }
      }
      extracted[field] = value;
    }

    const completionText = JSON.stringify(extracted);
    await storeAiUsageLog({
      endpoint: "/api/ai/extract",
      model: "regex-stub",
      promptText: String(sourceText || documentUrl),
      completionText,
      userId: toNumberOrNull(user_id),
    });

    res.json({
      documentUrl,
      extracted,
      mode: sourceText ? "regex+stub" : "stub",
      note: sourceText
        ? "Extraction used simple server-side patterns. For OCR and robust parsing, connect a document AI provider."
        : "No source text provided. Returned null placeholders only.",
    });
  });

  app.post("/api/ai/classify", async (req, res) => {
    const { text, classes, user_id } = req.body || {};
    if (!text) return res.status(400).json({ error: "text is required" });
    if (!Array.isArray(classes) || classes.length === 0) {
      return res.status(400).json({ error: "classes array is required" });
    }

    const input = String(text).toLowerCase();
    const cleaned = classes.map((c: any) => String(c || "").trim()).filter(Boolean);
    if (cleaned.length === 0) return res.status(400).json({ error: "classes array is empty after normalization" });

    const keywordHints: Record<string, string[]> = {
      billing: ["invoice", "payment", "subscription", "refund", "charge", "billing", "price"],
      technical: ["bug", "error", "api", "server", "down", "crash", "issue", "technical"],
      sales: ["quote", "proposal", "demo", "pricing", "contract", "lead", "opportunity", "sales"],
      support: ["help", "support", "problem", "cannot", "unable", "ticket"],
      legal: ["nda", "compliance", "legal", "terms", "contract", "privacy"],
    };

    const scores: Record<string, number> = {};
    for (const cls of cleaned) {
      const normalized = cls.toLowerCase();
      let score = 0;
      if (input.includes(normalized)) score += 0.7;
      for (const kw of (keywordHints[normalized] || [])) {
        if (input.includes(kw)) score += 0.18;
      }
      scores[cls] = Number(Math.min(0.99, score).toFixed(2));
    }

    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top = ranked[0];
    const label = top && top[1] > 0 ? top[0] : cleaned[0];
    const confidence = top ? top[1] : 0;

    await storeAiUsageLog({
      endpoint: "/api/ai/classify",
      model: "heuristic-stub",
      promptText: String(text),
      completionText: JSON.stringify({ label, confidence, scores }),
      userId: toNumberOrNull(user_id),
    });

    res.json({ label, confidence, scores });
  });

  // ─── AI Assistant ─────────────────────────────────────────────────────────────
  app.post("/api/ai", async (req, res) => {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: "messages array is required" });

    const today = new Date().toISOString().split("T")[0];
    const TASK_CREATOR_ROLES = ["Admin","Eiden HQ","Eiden Global","Operational Manager","Admin Coordinator","Brand Manager","Branding and Strategy Manager","Solution Architect"];

    const [
      { data: dealsData }, { data: tasksRaw }, { data: kbData }, { data: usersRaw },
      { data: contactsData }, { data: clientsData }, { data: allTasksData }
    ] = await Promise.all([
      supabase.from("deals").select("id, title, value, stage, risk_score, win_probability, contacts(name)").order("created_at", { ascending: false }).limit(20),
      supabase.from("tasks").select("id, title, status, priority, due_date, users!assignee_id(name, role)").neq("status", "Completed").order("due_date").limit(30),
      supabase.from("knowledge_base").select("title, content, category"),
      supabase.from("users").select("id, name, role, email"),
      supabase.from("contacts").select("id, name, company, status, source, ltv").order("created_at", { ascending: false }).limit(15),
      supabase.from("clients").select("id, name, industry, status, monthly_value, onboarding_stage, contact_person").order("created_at", { ascending: false }).limit(15),
      supabase.from("tasks").select("id, title, status, priority, due_date, users!assignee_id(name)").order("due_date", { ascending: false }).limit(50),
    ]);

    const assignableUsers = (usersRaw || []).filter((u: any) => TASK_CREATOR_ROLES.includes(u.role));
    const d = dealsData || [];
    const t = (tasksRaw || []).map((x: any) => ({ ...x, assignee: x.users?.name || "Unassigned" }));
    const allTasks = (allTasksData || []).map((x: any) => ({ ...x, assignee: x.users?.name || "Unassigned" }));
    const kb = kbData || [];
    const allContacts = contactsData || [];
    const allClients = clientsData || [];
    const allUsers = usersRaw || [];

    const pipelineValue = d.reduce((s: number, x: any) => s + (x.value || 0), 0);
    const wonDeals = d.filter((x: any) => x.stage === "Won").length;
    const closedDeals = d.filter((x: any) => ["Won","Lost"].includes(x.stage)).length;
    const winRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;
    const overdueTasks = t.filter((x: any) => x.due_date && x.due_date < today);
    const completedCount = allTasks.filter((x: any) => x.status === "Completed").length;
    const totalRevenue = d.filter((x: any) => x.stage === "Won").reduce((s: number, x: any) => s + (x.value || 0), 0);
    const totalMRR = allClients.filter((c: any) => c.status === "Active").reduce((s: number, c: any) => s + (c.monthly_value || 0), 0);

    const systemPrompt = `You are EIDEN AI, an intelligent BMS assistant for Eiden Group — a growth engineering and revenue architecture firm.

Your role: Help employees manage their work, monitor tasks, analyze deals, track pipeline health, answer questions about contacts/clients, and make smart decisions. Be concise, professional, and data-driven.

## LIVE BMS DATA (Today: ${today})
**Pipeline:** MAD ${pipelineValue.toLocaleString()} total | Won Revenue: MAD ${totalRevenue.toLocaleString()} | MRR: MAD ${totalMRR.toLocaleString()}
**Deals:** ${d.length} total | Active: ${d.filter((x: any) => !["Won","Lost"].includes(x.stage)).length} | Win Rate: ${winRate}%
**Tasks:** ${t.length} active | ${overdueTasks.length} overdue | ${completedCount} completed
**Team:** ${allUsers.length} members | **Contacts:** ${allContacts.length} | **Clients:** ${allClients.length}

**ALL ACTIVE TASKS (${t.length}):**
${t.map((x: any) => `- [#${x.id}][${x.priority}${x.due_date < today ? " ⚠OVERDUE" : ""}] "${x.title}" → ${x.assignee} (due: ${x.due_date}, ${x.status})`).join("\n") || "None"}

**ALL DEALS (${d.length}):**
${d.map((x: any) => `- [#${x.id}] "${x.title}": MAD ${(x.value||0).toLocaleString()} [${x.stage}] risk:${x.risk_score||0}% win_prob:${x.win_probability||0}% contact:${(x.contacts as any)?.name||"N/A"}`).join("\n") || "None"}

**CONTACTS (${allContacts.length}):**
${allContacts.map((c: any) => `- [#${c.id}] ${c.name} @ ${c.company||"—"} | ${c.status} | LTV: MAD ${(c.ltv||0).toLocaleString()}`).join("\n") || "None"}

**CLIENTS (${allClients.length}):**
${allClients.map((c: any) => `- [#${c.id}] ${c.name} | ${c.industry||"—"} | ${c.status} | MAD ${(c.monthly_value||0).toLocaleString()}/mo | ${c.onboarding_stage||"—"}`).join("\n") || "None"}

**TEAM MEMBERS (${allUsers.length}):**
${allUsers.map((u: any) => `- ${u.name} (${u.role})`).join("\n") || "None"}

**KNOWLEDGE BASE:**
${kb.map((k: any) => `[${k.category}] ${k.title}: ${k.content.slice(0, 150)}`).join("\n")}

## ACTION CAPABILITIES
When a user wants to create or update data, include a JSON action block in your response:

Create task (canCreate users only, assign to ASSIGNABLE MEMBERS below):
{"action":"create_task","data":{"title":"...","assignee":"name","due_date":"YYYY-MM-DD","priority":"High|Medium|Low","description":"..."}}

Update task:
{"action":"update_task","data":{"id":123,"status":"Completed|In Progress|Pending","priority":"High|Medium|Low","due_date":"YYYY-MM-DD"}}

Create deal:
{"action":"create_deal","data":{"title":"...","value":0,"stage":"Lead|Proposal|Negotiation"}}

Update deal:
{"action":"update_deal","data":{"id":123,"stage":"Won|Lost|Negotiation","value":0}}

Create contact:
{"action":"create_contact","data":{"name":"...","company":"...","status":"Lead|Active|Inactive"}}

**ASSIGNABLE TEAM MEMBERS:**
${assignableUsers.map((u: any) => `- ${u.name} (${u.role})`).join("\n") || "None available"}

## GUIDELINES
- Be concise — lead with the answer, then detail
- Use bullet points for lists and briefings
- Proactively highlight overdue tasks and at-risk deals
- Reference actual data (IDs, names, values) when answering
- If asked about an employee's tasks, filter the task list by their name
- Always ground analysis in the data provided above`;

    try {
      const text = await sendToAI(systemPrompt, messages.map((m: any) => ({ role: m.role, content: String(m.content) })));
      res.json({ text });
    } catch (err: any) {
      console.error(`AI error [${aiProvider}]:`, err.message);
      res.status(500).json({ error: "AI request failed", details: err.message });
    }
  });

  // ─── Service Worker — always no-cache so updates propagate instantly ──────────
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.sendFile(path.join(__dirname, process.env.NODE_ENV !== "production" ? "public/sw.js" : "dist/sw.js"));
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
    console.log(`\n🚀 Eiden AI BMS running → http://localhost:${PORT}`);
    console.log(`   AI: ${process.env.ANTHROPIC_API_KEY ? "✓ Claude configured" : "✗ Set ANTHROPIC_API_KEY in .env"}`);
    console.log(`   DB: ${process.env.SUPABASE_URL ? "✓ Supabase connected" : "✗ Set SUPABASE_URL in .env"}\n`);
  });
}

startServer().catch(console.error);
