import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import webpush from "web-push";
import { Resend } from "resend";
import admin from "firebase-admin";
import supabase from "./_lib/supabase";
import { sendToAI } from "./_lib/ai";
import { getZoomAccessToken } from "./_lib/zoom";
import { logActivity } from "./_lib/helpers";

type WorkflowRun = {
  runId: string;
  workflowName: string;
  status: "running" | "completed" | "failed";
  payload: any;
  startedAt: string;
  completedAt?: string;
};

const workflowRuns = new Map<string, WorkflowRun>();

type AuthContext = {
  userId: number;
  role: string;
  workspaceId: number | null;
  source: "token" | "header";
};

const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || "";
const AUTH_TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 12);
const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

const MANAGER_ROLES = new Set([
  "admin",
  "eiden hq",
  "eiden global",
  "operational manager",
  "admin coordinator",
  "brand manager",
  "branding and strategy manager",
  "solution architect",
  "manager",
]);

const BILLING_ROLES = new Set([
  "admin",
  "eiden hq",
  "operational manager",
  "admin coordinator",
]);

// ─── Firebase Admin initialization ───────────────────────────────────────────────
let firebaseApp: admin.app.App | null = null;

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin initialized from environment variables");
  } catch (error) {
    console.error("Firebase Admin initialization error:", error);
  }
} else {
  console.warn("Firebase Admin not initialized - FIREBASE_SERVICE_ACCOUNT_KEY not found in environment");
}

// Send FCM notification to a specific user
async function sendFCMNotification(userId: number, title: string, body: string, data?: any) {
  if (!firebaseApp) return;
  
  try {
    const { data: tokens } = await supabase.from("fcm_tokens").select("token").eq("user_id", userId);
    if (!tokens || tokens.length === 0) return;
    
    const message = {
      notification: { title, body },
      data: data || {},
      tokens: tokens.map((t: any) => t.token)
    };
    
    await admin.messaging().sendEachForMulticast(message);
  } catch (error) {
    console.error("FCM send error:", error);
  }
}

const firstValue = (value: any): any => (Array.isArray(value) ? value[0] : value);

const toNumberOrNull = (value: any): number | null => {
  const raw = firstValue(value);
  if (raw === undefined || raw === null || raw === "") return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
};

const parseActorId = (req: VercelRequest): number =>
  toNumberOrNull(req.headers["x-user-id"]) ||
  toNumberOrNull(req.query.user_id) ||
  toNumberOrNull((req.body || {}).user_id) ||
  1;

const estimateTokenCount = (text: string): number => (text ? Math.ceil(text.length / 4) : 0);

const normalizeRole = (role: any): string => String(role || "").trim().toLowerCase();

const canManage = (role: string): boolean => MANAGER_ROLES.has(normalizeRole(role));
const canBilling = (role: string): boolean => BILLING_ROLES.has(normalizeRole(role));

const b64urlEncode = (input: string | Buffer): string =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const b64urlDecode = (input: string): string => {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
};

const hmacHex = (secret: string, input: string): string =>
  createHmac("sha256", secret).update(input).digest("hex");

const hmacB64Url = (secret: string, input: string): string =>
  b64urlEncode(createHmac("sha256", secret).update(input).digest());

const safeEqualString = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

const issueAuthToken = (user: { id: number; role: string; workspace_id?: number | null }): string | null => {
  if (!AUTH_TOKEN_SECRET) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    role: user.role,
    workspace_id: user.workspace_id ?? null,
    iat: now,
    exp: now + AUTH_TOKEN_TTL_SECONDS,
    iss: "eiden-bms",
  };
  const header = { alg: "HS256", typ: "JWT" };
  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(payload));
  const sig = hmacB64Url(AUTH_TOKEN_SECRET, `${h}.${p}`);
  return `${h}.${p}.${sig}`;
};

const verifyAuthToken = (token: string): AuthContext | null => {
  if (!AUTH_TOKEN_SECRET) return null;
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = hmacB64Url(AUTH_TOKEN_SECRET, `${h}.${p}`);
  if (!safeEqualString(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(p)) as any;
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.sub || !payload?.role || !payload?.exp || now >= Number(payload.exp)) return null;
    return {
      userId: Number(payload.sub),
      role: String(payload.role),
      workspaceId: toNumberOrNull(payload.workspace_id),
      source: "token",
    };
  } catch {
    return null;
  }
};

const getAuthContext = (req: VercelRequest): AuthContext | null => {
  const authorization = String(firstValue(req.headers.authorization) || "");
  if (authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    const fromToken = verifyAuthToken(token);
    if (fromToken) return fromToken;
  }
  const headerUserId = toNumberOrNull(req.headers["x-user-id"]);
  const headerRole = String(firstValue(req.headers["x-user-role"]) || "").trim();
  const headerWorkspace = toNumberOrNull(req.headers["x-workspace-id"]);
  if (headerUserId && headerRole) {
    return {
      userId: headerUserId,
      role: headerRole,
      workspaceId: headerWorkspace,
      source: "header",
    };
  }
  return null;
};

const verifyStripeSignature = (req: VercelRequest): { ok: boolean; error?: string } => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!secret) return { ok: true };
  const header = String(firstValue(req.headers["stripe-signature"]) || "").trim();
  if (!header) return { ok: false, error: "Missing stripe-signature header" };

  const payload = JSON.stringify(req.body || {});
  if (header.includes("v1=")) {
    const parts = header.split(",").map(p => p.trim());
    const timestampPart = parts.find(p => p.startsWith("t="));
    const signatures = parts.filter(p => p.startsWith("v1=")).map(p => p.slice(3));
    if (!timestampPart || signatures.length === 0) {
      return { ok: false, error: "Invalid stripe-signature format" };
    }
    const timestamp = Number(timestampPart.slice(2));
    if (!Number.isFinite(timestamp)) return { ok: false, error: "Invalid signature timestamp" };
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
      return { ok: false, error: "Stripe signature expired" };
    }
    const expected = hmacHex(secret, `${timestamp}.${payload}`);
    const matched = signatures.some(sig => safeEqualString(sig, expected));
    return matched ? { ok: true } : { ok: false, error: "Invalid stripe signature" };
  }

  const expected = hmacHex(secret, payload);
  return safeEqualString(header, expected)
    ? { ok: true }
    : { ok: false, error: "Invalid stripe signature" };
};

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

async function emitEvent(topic: string, payload: any) {
  try {
    await supabase.from("event_log").insert({ topic, payload });
  } catch {}
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
  } catch {}
}

// ─── VAPID setup ──────────────────────────────────────────────────────────────
const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY  || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails("mailto:admin@eiden-group.com", vapidPublicKey, vapidPrivateKey);
}

// ─── Email setup (Resend) ─────────────────────────────────────────────────────
const resendApiKey = process.env.RESEND_API_KEY || "";
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const emailFrom = process.env.EMAIL_FROM_ADDRESS || "noreply@eiden-group.com";
const baseUrl = process.env.BASE_URL || "http://localhost:3000";

const sendPasswordResetEmail = async (email: string, name: string, resetToken: string): Promise<boolean> => {
  if (!resend) {
    console.warn("Resend not configured. Skipping email send.");
    return false;
  }
  
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
  
  try {
    const result = await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: "Reset your Eiden BMS password",
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2>Password Reset Request</h2>
          <p>Hi ${name},</p>
          <p>We received a request to reset your password for your Eiden BMS account. Click the button below to set a new password.</p>
          <p style="margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #122620; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
              Reset Password
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            Or copy this link: <br/>
            <code style="background: #f5f5f5; padding: 8px; display: inline-block; word-break: break-all;">${resetLink}</code>
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            This link expires in 24 hours. If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `
    });
    
    return !!result;
  } catch (error: any) {
    console.error("Failed to send reset email:", error.message);
    return false;
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawPath = req.query.path;
  const segments: string[] = Array.isArray(rawPath)
    ? rawPath
    : typeof rawPath === "string"
    ? rawPath.split("/").filter(Boolean)
    : [];
  const [r0, r1, r2, r3, r4] = segments;
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

    // ─── IBMS v1 API layer ───────────────────────────────────────────────────
    if (r0 === "v1") {
      const isStripeWebhookRoute = r1 === "billing" && r2 === "webhooks" && r3 === "stripe" && method === "POST";
      if (isStripeWebhookRoute) {
        const sig = verifyStripeSignature(req);
        if (!sig.ok) return res.status(401).json({ error: sig.error || "Invalid webhook signature" });

        const event = req.body || {};
        const eventType = String(event.type || "").trim();
        const eventId = String(event.id || "").trim();
        const externalInvoiceId = event?.data?.object?.id || req.body?.invoice_id || null;

        if (eventId) {
          const ins = await supabase
            .from("webhook_receipts")
            .insert({ provider: "stripe", event_id: eventId, payload: event });
          if (ins.error && ins.error.code === "23505") {
            return res.json({ received: true, duplicate: true, id: eventId });
          }
        }

        if (eventType === "invoice.payment_succeeded" && externalInvoiceId) {
          await supabase.from("invoices").update({ status: "paid" }).eq("stripe_invoice_id", externalInvoiceId);
        } else if (eventType === "invoice.payment_failed" && externalInvoiceId) {
          await supabase.from("invoices").update({ status: "overdue" }).eq("stripe_invoice_id", externalInvoiceId);
        }

        await emitEvent("billing.webhook_received", { type: eventType || "unknown", id: eventId || null });
        return res.json({ received: true, type: eventType || "unknown" });
      }

      const auth = getAuthContext(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized. Provide Bearer token or x-user-id/x-user-role headers." });
      }

      // /api/v1/clients...
      if (r1 === "clients") {
        if (!r2) {
          if (method === "GET") {
            const page = Math.max(1, Number(req.query.page || 1));
            const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
            const start = (page - 1) * limit;
            const end = start + limit - 1;
            const workspaceId = toNumberOrNull(req.query.workspace_id);
            const tags = String(req.query.tags || "")
              .split(",")
              .map(t => t.trim())
              .filter(Boolean);

            let query = supabase
              .from("clients")
              .select("*", { count: "exact" })
              .order("created_at", { ascending: false })
              .range(start, end);
            if (workspaceId && auth.workspaceId && workspaceId !== auth.workspaceId && !canManage(auth.role)) {
              return res.status(403).json({ error: "Forbidden: cross-workspace access denied" });
            }
            const effectiveWorkspaceId = canManage(auth.role)
              ? workspaceId
              : (auth.workspaceId || workspaceId);
            if (effectiveWorkspaceId) query = query.eq("workspace_id", effectiveWorkspaceId);
            const { data, count, error } = await query;
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
            return res.json({ page, limit, total: count ?? items.length, tagFilterApplied, items });
          }

          if (method === "POST") {
            if (!canManage(auth.role)) {
              return res.status(403).json({ error: "Forbidden: manager role required" });
            }
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

            const payload: any = {
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
            let { data, error } = await supabase.from("clients").insert(payload).select().single();

            if (error) {
              const fallbackPayload = {
                name: payload.name,
                industry: payload.industry,
                status: payload.status,
                workspace_id: payload.workspace_id,
                onboarding_stage: payload.onboarding_stage,
                contact_person: payload.contact_person,
                contact_email: payload.contact_email,
                contact_phone: payload.contact_phone,
                monthly_value: payload.monthly_value,
                notes: payload.notes,
              };
              const fallback = await supabase.from("clients").insert(fallbackPayload).select().single();
              data = fallback.data;
              error = fallback.error;
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
            await emitEvent("client.created", { client_id: clientId, workspace_id: payload.workspace_id });
            await logActivity(auth.userId, `Created client(v1): ${payload.name}`, payload.name, "client");
            return res.json({ id: clientId });
          }
        }

        if (r2 && r3 === "onboarding" && r4 === "progress" && method === "GET") {
          const clientId = Number(r2);
          if (!clientId) return res.status(400).json({ error: "Invalid client id" });
          const { data, error } = await supabase
            .from("clients")
            .select("id, name, status, onboarding_stage, workspace_id, created_at, updated_at")
            .eq("id", clientId)
            .maybeSingle();
          if (error) return res.status(500).json({ error: error.message });
          if (!data) return res.status(404).json({ error: "Client not found" });
          if (auth.workspaceId && data.workspace_id && data.workspace_id !== auth.workspaceId && !canManage(auth.role)) {
            return res.status(403).json({ error: "Forbidden: cross-workspace access denied" });
          }
          const status = String(data.status || "");
          const progress = /active|completed/i.test(status)
            ? 100
            : onboardingStageToProgress(data.onboarding_stage);
          return res.json({
            clientId: data.id,
            clientName: data.name,
            stage: data.onboarding_stage || null,
            status: data.status || null,
            progress,
            updatedAt: data.updated_at || data.created_at || null,
          });
        }

        if (r2 && r3 === "custom-fields" && method === "PUT") {
          if (!canManage(auth.role)) {
            return res.status(403).json({ error: "Forbidden: manager role required" });
          }
          const clientId = Number(r2);
          const customFields = req.body || {};
          if (!clientId) return res.status(400).json({ error: "Invalid client id" });
          if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) {
            return res.status(400).json({ error: "Body must be a JSON object" });
          }
          const { error } = await supabase
            .from("clients")
            .update({ custom_fields: customFields, updated_at: new Date().toISOString() })
            .eq("id", clientId);
          if (error) return res.status(500).json({ error: error.message });
          await emitEvent("client.custom_fields_updated", { client_id: clientId });
          return res.json({ success: true });
        }
      }

      // /api/v1/tasks...
      if (r1 === "tasks") {
        if (r2 === "assigned" && r3 === "me" && method === "GET") {
          const requestedUserId = toNumberOrNull(req.query.user_id ?? req.headers["x-user-id"]);
          const userId = requestedUserId || auth.userId;
          const status = String(req.query.status || "").trim();
          if (requestedUserId && requestedUserId !== auth.userId && !canManage(auth.role)) {
            return res.status(403).json({ error: "Forbidden: cannot view other users' tasks" });
          }
          let query = supabase.from("tasks").select("*").eq("assignee_id", userId).order("due_date", { ascending: true });
          if (auth.workspaceId) query = query.eq("workspace_id", auth.workspaceId);
          if (status) query = query.ilike("status", status);
          const { data, error } = await query;
          if (error) return res.status(500).json({ error: error.message });
          return res.json(data || []);
        }

        if (r2 && r3 === "complete" && method === "POST") {
          const taskId = Number(r2);
          if (!taskId) return res.status(400).json({ error: "Invalid task id" });
          if (!canManage(auth.role)) {
            const ownership = await supabase
              .from("tasks")
              .select("id, assignee_id, workspace_id")
              .eq("id", taskId)
              .maybeSingle();
            if (ownership.error) return res.status(500).json({ error: ownership.error.message });
            if (!ownership.data) return res.status(404).json({ error: "Task not found" });
            if (auth.workspaceId && ownership.data.workspace_id && ownership.data.workspace_id !== auth.workspaceId) {
              return res.status(403).json({ error: "Forbidden: cross-workspace access denied" });
            }
            if (Number(ownership.data.assignee_id || 0) !== auth.userId) {
              return res.status(403).json({ error: "Forbidden: only assignee or manager can complete this task" });
            }
          }
          const { error } = await supabase.from("tasks").update({ status: "Completed" }).eq("id", taskId);
          if (error) return res.status(500).json({ error: error.message });
          await emitEvent("task.completed", { task_id: taskId });
          await logActivity(auth.userId, `Completed task #${taskId}`, String(taskId), "task");
          return res.json({ success: true });
        }

        if (r2 && r3 === "escalate" && method === "POST") {
          if (!canManage(auth.role)) {
            return res.status(403).json({ error: "Forbidden: manager role required" });
          }
          const taskId = Number(r2);
          if (!taskId) return res.status(400).json({ error: "Invalid task id" });
          const { error } = await supabase.from("tasks").update({ priority: "High" }).eq("id", taskId);
          if (error) return res.status(500).json({ error: error.message });
          await emitEvent("task.escalated", { task_id: taskId, reason: req.body?.reason || null });
          await logActivity(auth.userId, `Escalated task #${taskId}`, String(taskId), "task");
          return res.json({ success: true, escalated: true });
        }
      }

      // /api/v1/workflows...
      if (r1 === "workflows") {
        if (r2 === "trigger" && method === "POST") {
          if (!canManage(auth.role)) {
            return res.status(403).json({ error: "Forbidden: manager role required" });
          }
          const workflowName = String(req.body?.workflowName || req.body?.name || "").trim();
          const payload = req.body?.payload || {};
          if (!workflowName) return res.status(400).json({ error: "workflowName is required" });

          const runId = randomUUID();
          const startedAt = new Date().toISOString();
          workflowRuns.set(runId, { runId, workflowName, status: "running", payload, startedAt });
          await supabase.from("workflow_executions").insert({
            id: runId,
            workflow_id: workflowName,
            temporal_run_id: runId,
            status: "running",
            context: payload,
            started_at: startedAt,
          });

          setTimeout(async () => {
            const current = workflowRuns.get(runId);
            if (!current || current.status !== "running") return;
            current.status = "completed";
            current.completedAt = new Date().toISOString();
            workflowRuns.set(runId, current);
            await supabase
              .from("workflow_executions")
              .update({ status: "completed", completed_at: current.completedAt })
              .eq("id", runId);
          }, 1500);

          await emitEvent("workflow.triggered", { run_id: runId, workflow_name: workflowName });
          return res.json({ runId, workflowName, status: "running", startedAt });
        }

        if (r2 && r3 === "status" && method === "GET") {
          if (!canManage(auth.role)) {
            return res.status(403).json({ error: "Forbidden: manager role required" });
          }
          const runId = String(r2 || "").trim();
          if (!runId) return res.status(400).json({ error: "Invalid runId" });
          const { data, error } = await supabase
            .from("workflow_executions")
            .select("id, workflow_id, temporal_run_id, status, context, started_at, completed_at")
            .eq("id", runId)
            .maybeSingle();
          if (error) return res.status(500).json({ error: error.message });
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
          const inMemory = workflowRuns.get(runId);
          if (!inMemory) return res.status(404).json({ error: "Workflow run not found" });
          return res.json({
            runId: inMemory.runId,
            workflowName: inMemory.workflowName,
            status: inMemory.status,
            startedAt: inMemory.startedAt,
            completedAt: inMemory.completedAt || null,
            context: inMemory.payload || {},
            source: "memory",
          });
        }
      }

      // /api/v1/billing...
      if (r1 === "billing") {
        if (r2 === "subscriptions" && r3 && r4 === "create" && method === "POST") {
          if (!canBilling(auth.role)) {
            return res.status(403).json({ error: "Forbidden: billing/admin role required" });
          }
          const clientId = Number(r3);
          if (!clientId) return res.status(400).json({ error: "Invalid clientId" });
          const nextPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          const subscriptionId = `sub_${clientId}_${Date.now()}`;
          const status = String(req.body?.status || "active");
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
          if (error) {
            const fallback = await supabase
              .from("subscriptions")
              .insert({ client_id: clientId, status })
              .select()
              .single();
            data = fallback.data;
            error = fallback.error;
          }
          if (error) return res.status(500).json({ error: error.message });
          await emitEvent("billing.subscription_created", { client_id: clientId, subscription_id: subscriptionId });
          return res.json({
            id: data?.id,
            client_id: clientId,
            stripe_subscription_id: data?.stripe_subscription_id || subscriptionId,
            status: data?.status || status,
            current_period_end: data?.current_period_end || nextPeriodEnd,
          });
        }

        if (r2 === "invoices" && method === "GET") {
          if (!canBilling(auth.role)) {
            return res.status(403).json({ error: "Forbidden: billing/admin role required" });
          }
          const status = String(req.query.status || "").trim();
          let query = supabase.from("invoices").select("*").order("issued_at", { ascending: false }).limit(200);
          if (status) query = query.eq("status", status);
          const { data, error } = await query;
          if (error) return res.status(500).json({ error: error.message });
          return res.json(data || []);
        }
      }
    }

    // ─── Firebase Config ────────────────────────────────────────────────────────
    if (r0 === "firebase-config" && method === "GET") {
      console.log("=== Firebase Environment Variables (Vercel) ===");
      console.log("FIREBASE_API_KEY:", process.env.FIREBASE_API_KEY ? "***" : "MISSING");
      console.log("FIREBASE_AUTH_DOMAIN:", process.env.FIREBASE_AUTH_DOMAIN || "MISSING");
      console.log("FIREBASE_PROJECT_ID:", process.env.FIREBASE_PROJECT_ID || "MISSING");
      console.log("FIREBASE_STORAGE_BUCKET:", process.env.FIREBASE_STORAGE_BUCKET || "MISSING");
      console.log("FIREBASE_MESSAGING_SENDER_ID:", process.env.FIREBASE_MESSAGING_SENDER_ID || "MISSING");
      console.log("FIREBASE_APP_ID:", process.env.FIREBASE_APP_ID || "MISSING");
      console.log("FIREBASE_MEASUREMENT_ID:", process.env.FIREBASE_MEASUREMENT_ID || "MISSING");
      console.log("FIREBASE_VAPID_KEY:", process.env.FIREBASE_VAPID_KEY ? "***" : "MISSING");
      
      const config = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID,
        vapidKey: process.env.FIREBASE_VAPID_KEY
      };
      
      if (!config.projectId || !config.apiKey) {
        return res.status(500).json({ error: "Firebase configuration is incomplete on the server" });
      }
      
      return res.json(config);
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
          const { data } = await supabase
            .from("tasks")
            .select("*, users!assignee_id(name), deals!related_deal_id(title), clients!client_id(name)")
            .order("due_date", { ascending: true });

          const tasks = (data || []).map((t: any) => ({
            ...t,
            assignee_name: t.users?.name || "",
            deal_title: t.deals?.title || "",
            client_name: t.clients?.name || "",
          }));

          const taskIds = tasks.map((t: any) => t.id).filter(Boolean);
          if (taskIds.length === 0) return res.json(tasks);

          const [{ data: subtasksRaw }, { data: commentsRaw }] = await Promise.all([
            supabase.from("task_subtasks").select("*").in("task_id", taskIds).order("created_at", { ascending: true }),
            supabase
              .from("task_comments")
              .select("*, users(name)")
              .in("task_id", taskIds)
              .order("created_at", { ascending: false }),
          ]);

          const subtasksByTask = new Map<number, any[]>();
          for (const st of subtasksRaw || []) {
            const key = Number((st as any).task_id);
            if (!subtasksByTask.has(key)) subtasksByTask.set(key, []);
            subtasksByTask.get(key)!.push(st);
          }

          const commentsByTask = new Map<number, any[]>();
          for (const c of commentsRaw || []) {
            const key = Number((c as any).task_id);
            if (!commentsByTask.has(key)) commentsByTask.set(key, []);
            commentsByTask.get(key)!.push({
              ...(c as any),
              user_name: (c as any).users?.name || "",
            });
          }

          return res.json(
            tasks.map((t: any) => ({
              ...t,
              subtasks: subtasksByTask.get(Number(t.id)) || [],
              comments: commentsByTask.get(Number(t.id)) || [],
            }))
          );
        }
        if (method === "POST") {
          const { title, description, assignee_id, client_id, workspace_id, due_date, status, priority } = req.body;
          if (!title) return res.status(400).json({ error: "Title is required" });
          const effectiveDueDate = due_date || null;
          const effectiveStatus = !effectiveDueDate ? "Pending" : (status || "Pending");
          const { data, error } = await supabase.from("tasks").insert({ title, description, assignee_id: assignee_id || null, client_id: client_id || null, workspace_id: workspace_id || null, due_date: effectiveDueDate, status: effectiveStatus, priority: priority || "Medium" }).select().single();
          if (error) return res.status(500).json({ error: error.message });
          await logActivity(assignee_id || 1, `Created task: ${title}`, title, "task");
          
          // Send FCM notification to assignee
          if (assignee_id && data?.id) {
            await sendFCMNotification(
              Number(assignee_id),
              "New Task Assigned",
              `You have been assigned to: ${title}`,
              { taskId: data.id, action: "open_task" }
            );
          }
          
          return res.json({ id: data?.id });
        }
      }
      if (r1) {
        if (r2 === "subtasks") {
          // GET /api/tasks/:id/subtasks
          if (method === "GET") {
            const { data, error } = await supabase
              .from("task_subtasks")
              .select("*")
              .eq("task_id", r1)
              .order("created_at", { ascending: true });
            if (error) return res.status(500).json({ error: error.message });
            return res.json(data || []);
          }

          // POST /api/tasks/:id/subtasks (management only)
          if (method === "POST") {
            const { title, due_date, status } = req.body || {};
            if (!title) return res.status(400).json({ error: "Title is required" });

            const actorId = parseActorId(req);
            const { data: actor, error: actorErr } = await supabase
              .from("users")
              .select("role")
              .eq("id", actorId)
              .maybeSingle();
            if (actorErr) return res.status(500).json({ error: actorErr.message });

            const isManagement = !!(actor?.role && canManage(String(actor.role)));
            if (!isManagement) {
              return res.status(403).json({ error: "Only management can add subtasks" });
            }

            const { data, error } = await supabase
              .from("task_subtasks")
              .insert({
                task_id: Number(r1),
                title: String(title),
                due_date: due_date || null,
                status: status || "Pending",
              })
              .select()
              .single();
            if (error) return res.status(500).json({ error: error.message });
            return res.json({ id: data?.id });
          }
        }

        if (r2 === "comments") {
          // GET /api/tasks/:id/comments
          if (method === "GET") {
            const { data, error } = await supabase
              .from("task_comments")
              .select("*, users(name)")
              .eq("task_id", r1)
              .order("created_at", { ascending: false });
            if (error) return res.status(500).json({ error: error.message });
            return res.json(
              (data || []).map((c: any) => ({
                ...c,
                user_name: c.users?.name || "",
              }))
            );
          }

          // POST /api/tasks/:id/comments
          if (method === "POST") {
            const { content, user_id } = req.body || {};
            if (!content) return res.status(400).json({ error: "Content is required" });
            if (!user_id) return res.status(400).json({ error: "User ID is required" });

            const actorId = parseActorId(req);
            const [{ data: task, error: taskErr }, { data: actor, error: actorErr }] = await Promise.all([
              supabase.from("tasks").select("assignee_id, title").eq("id", r1).maybeSingle(),
              supabase.from("users").select("role, name").eq("id", actorId).maybeSingle(),
            ]);
            if (taskErr) return res.status(500).json({ error: taskErr.message });
            if (actorErr) return res.status(500).json({ error: actorErr.message });
            if (!task) return res.status(404).json({ error: "Task not found" });

            const isManagement = !!(actor?.role && canManage(String(actor.role)));
            const isAssignee = Number(task.assignee_id || 0) === Number(actorId || 0);
            if (!isManagement && !isAssignee) {
              return res.status(403).json({ error: "You can only comment on tasks assigned to you" });
            }

            const { data, error } = await supabase
              .from("task_comments")
              .insert({ task_id: Number(r1), user_id: Number(user_id), content: String(content) })
              .select()
              .single();
            if (error) return res.status(500).json({ error: error.message });
            
            // Send FCM notification to management users
            if (task && actor) {
              const managementRoles = ["Admin", "Eiden HQ", "Eiden Global", "Operational Manager", "Admin Coordinator", "Brand Manager", "Branding and Strategy Manager", "Solution Architect"];
              const { data: managers } = await supabase.from("users").select("id").in("role", managementRoles);
              if (managers) {
                for (const manager of managers) {
                  await sendFCMNotification(
                    manager.id,
                    "New Comment Added",
                    `${actor.name} commented on: ${task.title}`,
                    { taskId: Number(r1), action: "open_task" }
                  );
                }
              }
            }
            
            return res.json({ id: data?.id });
          }
        }

        if (method === "PATCH") {
          const { title, description, assignee_id, related_deal_id, client_id, due_date, status, priority, overdue_reason, overdue_reason_at, rejection_reason } = req.body;
          
          // Get current task before update
          const { data: currentTask } = await supabase.from("tasks").select("*").eq("id", r1).maybeSingle();
          
          // Enforce workflow: tasks can only be marked as Completed if they are in Review
          if (status === "Completed" && currentTask?.status !== "Review") {
            return res.status(400).json({ error: "Tasks must be in Review status before being marked as Completed" });
          }
          
          // Only update fields that were explicitly provided (prevents undefined from nullifying existing values)
          const updates: any = {};
          if (title !== undefined) updates.title = title;
          if (description !== undefined) updates.description = description;
          if (assignee_id !== undefined) updates.assignee_id = assignee_id;
          if (related_deal_id !== undefined) updates.related_deal_id = related_deal_id;
          if (client_id !== undefined) updates.client_id = client_id;
          if (due_date !== undefined) updates.due_date = due_date;
          if (status !== undefined) updates.status = status;
          if (priority !== undefined) updates.priority = priority;
          if (overdue_reason !== undefined) updates.overdue_reason = overdue_reason;
          if (overdue_reason_at !== undefined) updates.overdue_reason_at = overdue_reason_at;
          if (rejection_reason !== undefined) updates.rejection_reason = rejection_reason;
          await supabase.from("tasks").update(updates).eq("id", r1);
          
          // Send FCM notifications based on status changes
          if (currentTask && updates.status) {
            const managementRoles = ["Admin", "Eiden HQ", "Eiden Global", "Operational Manager", "Admin Coordinator", "Brand Manager", "Branding and Strategy Manager", "Solution Architect"];
            
            // Task moved to Review - notify management
            if (updates.status === "Review" && currentTask.status !== "Review") {
              const { data: managers } = await supabase.from("users").select("id").in("role", managementRoles);
              if (managers) {
                for (const manager of managers) {
                  await sendFCMNotification(
                    manager.id,
                    "Task Ready for Review",
                    `${currentTask.title} is now in Review`,
                    { taskId: Number(r1), action: "open_task" }
                  );
                }
              }
            }
            
            // Task rejected (moved to In Progress with rejection_reason) - notify assignee
            if (updates.status === "In Progress" && updates.rejection_reason && currentTask.status === "Review") {
              if (currentTask.assignee_id) {
                await sendFCMNotification(
                  currentTask.assignee_id,
                  "Task Rejected",
                  `${currentTask.title} was rejected. Reason: ${updates.rejection_reason}`,
                  { taskId: Number(r1), action: "open_task" }
                );
              }
            }
            
            // Task moved to In Progress without due date - notify management
            if (updates.status === "In Progress" && !updates.due_date && !currentTask.due_date) {
              const { data: managers } = await supabase.from("users").select("id").in("role", managementRoles);
              if (managers) {
                for (const manager of managers) {
                  await sendFCMNotification(
                    manager.id,
                    "Due Date Required",
                    `${currentTask.title} is In Progress but has no due date. Please set one.`,
                    { taskId: Number(r1), action: "open_task" }
                  );
                }
              }
            }
          }
          
          return res.json({ success: true });
        }
        if (method === "DELETE") {
          await supabase.from("tasks").delete().eq("id", r1);
          return res.json({ success: true });
        }
      }
    }

    // ─── Subtasks (update/delete) ─────────────────────────────────────────────
    if (r0 === "subtasks" && r1) {
      if (method === "PATCH") {
        const updates: any = {};
        for (const f of ["title", "due_date", "status", "rejection_reason"]) {
          if (Object.prototype.hasOwnProperty.call(req.body || {}, f)) updates[f] = (req.body as any)[f] ?? null;
        }
        const { error } = await supabase.from("task_subtasks").update(updates).eq("id", r1);
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }
      if (method === "DELETE") {
        const actorId = parseActorId(req);
        const { data: actor, error: actorErr } = await supabase
          .from("users")
          .select("role")
          .eq("id", actorId)
          .maybeSingle();
        if (actorErr) return res.status(500).json({ error: actorErr.message });

        const isManagement = !!(actor?.role && canManage(String(actor.role)));
        if (!isManagement) {
          return res.status(403).json({ error: "Only management can delete subtasks" });
        }

        const { error } = await supabase.from("task_subtasks").delete().eq("id", r1);
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }
    }

    // ─── Comments (delete) ────────────────────────────────────────────────────
    if (r0 === "comments" && r1) {
      if (method === "DELETE") {
        const actorId = parseActorId(req);
        const [{ data: comment, error: commentErr }, { data: actor, error: actorErr }] = await Promise.all([
          supabase.from("task_comments").select("user_id").eq("id", r1).maybeSingle(),
          supabase.from("users").select("role").eq("id", actorId).maybeSingle(),
        ]);
        if (commentErr) return res.status(500).json({ error: commentErr.message });
        if (actorErr) return res.status(500).json({ error: actorErr.message });
        if (!comment) return res.status(404).json({ error: "Comment not found" });

        const isManagement = !!(actor?.role && canManage(String(actor.role)));
        const isOwner = Number(comment.user_id || 0) === Number(actorId || 0);
        if (!isManagement && !isOwner) {
          return res.status(403).json({ error: "You can only delete your own comments" });
        }

        const { error } = await supabase.from("task_comments").delete().eq("id", r1);
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }
    }

    // ─── Time Logs ────────────────────────────────────────────────────────────
    if (r0 === "time-logs") {
      if (!r1) {
        if (method === "GET") {
          const workspace_id = req.query.workspace_id ? Number(req.query.workspace_id) : undefined;
          const user_id = req.query.user_id ? Number(req.query.user_id) : undefined;
          let q = supabase.from("time_logs").select("*").order("start_time", { ascending: false }).limit(200);
          if (workspace_id) q = q.eq("workspace_id", workspace_id);
          if (user_id) q = q.eq("user_id", user_id);
          const { data } = await q;
          return res.json(data || []);
        }
        if (method === "POST") {
          const { user_id, user_name, task_id, task_title, start_time, notes, workspace_id } = req.body;
          const { data } = await supabase.from("time_logs").insert({
            user_id, user_name: user_name || "", task_id: task_id || null, task_title: task_title || "",
            start_time: start_time || new Date().toISOString(), notes: notes || "", workspace_id
          }).select().single();
          return res.json({ id: data?.id });
        }
      }
      if (r1) {
        if (method === "PATCH") {
          const { end_time, duration_minutes, notes } = req.body;
          await supabase.from("time_logs").update({ end_time, duration_minutes, notes }).eq("id", r1);
          return res.json({ success: true });
        }
        if (method === "DELETE") {
          await supabase.from("time_logs").delete().eq("id", r1);
          return res.json({ success: true });
        }
      }
    }

    // ─── Clients ──────────────────────────────────────────────────────────────
    if (r0 === "clients") {
      if (!r1) {
        if (method === "GET") {
          const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
          return res.json(data || []);
        }
        if (method === "POST") {
          const { name, industry, status, onboarding_stage, contact_person, contact_email, contact_phone, monthly_value, notes, workspace_id } = req.body;
          if (!name) return res.status(400).json({ error: "Name is required" });
          const { data } = await supabase.from("clients").insert({ name, industry, status: status || "Active", onboarding_stage: onboarding_stage || "Not Started", contact_person, contact_email, contact_phone, monthly_value: Number(monthly_value) || 0, notes, workspace_id }).select().single();
          await logActivity(1, `Added client: ${name}`, name, "client");
          return res.json({ id: data?.id });
        }
      }
      if (r1) {
        if (method === "PATCH") {
          const { name, industry, status, onboarding_stage, contact_person, contact_email, contact_phone, monthly_value, notes } = req.body;
          await supabase.from("clients").update({ name, industry, status, onboarding_stage, contact_person, contact_email, contact_phone, monthly_value: Number(monthly_value) || 0, notes }).eq("id", r1);
          return res.json({ success: true });
        }
        if (method === "DELETE") {
          await supabase.from("clients").delete().eq("id", r1);
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
        const token = issueAuthToken(user);
        return res.json({
          id: user.id,
          name: user.name,
          role: user.role,
          workspace_id: user.workspace_id,
          token,
          token_type: token ? "Bearer" : null,
          expires_in: token ? AUTH_TOKEN_TTL_SECONDS : null,
        });
      }
      if (r1 === "forgot-password" && method === "POST") {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required" });
        const { data: user } = await supabase.from("users").select("id, email, name").eq("email", email).maybeSingle();
        if (!user) {
          // Don't reveal if email exists (security best practice)
          return res.json({ success: true, message: "If email exists, a reset link has been sent" });
        }
        // Generate a recovery token valid for 24 hours
        const resetToken = randomUUID();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        let { error: insertError } = await supabase.from("password_resets").insert({
          user_id: user.id,
          email: user.email,
          token: resetToken,
          expires_at: expiresAt,
          used: false
        });
        // If table doesn't exist, just return success (email sending would happen separately)
        if (insertError && insertError.code === "PGRST116") {
          return res.json({ success: true, message: "If email exists, a reset link has been sent" });
        }
        // Send email with reset link
        await sendPasswordResetEmail(user.email, user.name, resetToken);
        await logActivity(user.id, "Requested password reset", user.email, "auth");
        return res.json({ 
          success: true, 
          message: "If email exists, a reset link has been sent"
        });
      }
      if (r1 === "reset-password" && method === "POST") {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ error: "Token and password required" });
        if (newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
        
        // Find the reset token
        const { data: resetRecord } = await supabase
          .from("password_resets")
          .select("*")
          .eq("token", token)
          .eq("used", false)
          .maybeSingle();
        
        if (!resetRecord) return res.status(400).json({ error: "Invalid or expired reset link" });
        
        const now = new Date();
        const expiresAt = new Date(resetRecord.expires_at);
        if (now > expiresAt) {
          return res.status(400).json({ error: "Reset link has expired" });
        }
        
        // Update password
        const hashed = await bcrypt.hash(newPassword, 10);
        await supabase.from("users").update({ password: hashed }).eq("id", resetRecord.user_id);
        
        // Mark token as used
        await supabase.from("password_resets").update({ used: true }).eq("id", resetRecord.id);
        
        await logActivity(resetRecord.user_id, "Reset password", resetRecord.email, "auth");
        return res.json({ success: true, message: "Password reset successfully" });
      }
      if (r1 === "register" && method === "POST") {
        const { name, email, username, password, role: requestedRole } = req.body;
        if (!name || !email || !username || !password || !requestedRole) return res.status(400).json({ error: "Missing required fields" });
        if (!String(email).toLowerCase().endsWith("@eiden-group.com")) return res.status(400).json({ error: "Only @eiden-group.com email addresses are accepted" });
        const { data: exists } = await supabase.from("users").select("id").or(`username.eq.${username},email.eq.${email}`).maybeSingle();
        if (exists) return res.status(409).json({ error: "Username or email already taken" });
        // All new registrations are assigned to the first/default workspace and set as pending (no workspace_id) until Admin approves
        const { data: defaultWs } = await supabase.from("workspaces").select("id").order("id").limit(1).maybeSingle();
        const workspace_id = defaultWs?.id ?? null;
        const hashed = await bcrypt.hash(password, 10);
        const { data } = await supabase.from("users").insert({ name, email, username, password: hashed, role: requestedRole, workspace_id }).select().single();
        await logActivity(data?.id, `Registered: ${name}`, `Role: ${requestedRole} — pending approval`, "auth");
        return res.json({ id: data?.id, role: requestedRole, workspace_id });
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
      if (r1 === "chat" && method === "POST") {
        const { messages, model, systemPrompt, user_id } = req.body || {};
        if (!Array.isArray(messages) || messages.length === 0) {
          return res.status(400).json({ error: "messages array is required" });
        }

        const normalized = messages
          .map((m: any) => ({ role: String(m?.role || "user"), content: String(m?.content || "") }))
          .filter((m: any) => m.content.trim().length > 0);
        if (normalized.length === 0) return res.status(400).json({ error: "messages must contain content" });

        const { data: settings } = await supabase.from("global_settings").select("ai_provider").eq("id", 1).maybeSingle();
        const provider = String(model || settings?.ai_provider || process.env.AI_PROVIDER || "groq");
        const promptText = normalized.map((m: any) => `${m.role}: ${m.content}`).join("\n");
        const startedAt = Date.now();

        try {
          const text = await sendToAI(
            String(systemPrompt || "You are an internal business assistant. Be concise and accurate."),
            normalized,
            provider
          );
          await storeAiUsageLog({
            endpoint: "/api/ai/chat",
            model: provider,
            promptText,
            completionText: text,
            userId: toNumberOrNull(user_id),
          });
          return res.json({
            text,
            model: provider,
            provider,
            latency_ms: Date.now() - startedAt,
          });
        } catch (err: any) {
          return res.status(500).json({ error: "AI request failed", details: err?.message || "Unknown error" });
        }
      }

      if (r1 === "extract" && method === "POST") {
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

        await storeAiUsageLog({
          endpoint: "/api/ai/extract",
          model: "regex-stub",
          promptText: String(sourceText || documentUrl),
          completionText: JSON.stringify(extracted),
          userId: toNumberOrNull(user_id),
        });

        return res.json({
          documentUrl,
          extracted,
          mode: sourceText ? "regex+stub" : "stub",
          note: sourceText
            ? "Extraction used simple server-side patterns. For OCR and robust parsing, connect a document AI provider."
            : "No source text provided. Returned null placeholders only.",
        });
      }

      if (r1 === "classify" && method === "POST") {
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

        return res.json({ label, confidence, scores });
      }

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
        const [{ data: dealsData }, { data: tasksRaw }, { data: kbData }, { data: contactsData }] = await Promise.all([
          supabase.from("deals").select("id, title, value, stage, risk_score, contacts(name)").order("created_at", { ascending: false }).limit(20),
          supabase.from("tasks").select("id, title, status, priority, due_date, users!assignee_id(name)").neq("status", "Completed").order("due_date").limit(20),
          supabase.from("knowledge_base").select("title, content, category"),
          supabase.from("contacts").select("id, name, company, email, status").order("created_at", { ascending: false }).limit(20),
        ]);
        const d = dealsData || [];
        const t = (tasksRaw || []).map((x: any) => ({ ...x, assignee: x.users?.name || "Unassigned" }));
        const kb = kbData || [];
        const contacts = contactsData || [];
        const pipelineValue = d.reduce((s: number, x: any) => s + (x.value || 0), 0);
        const wonDeals = d.filter((x: any) => x.stage === "Won").length;
        const closedDeals = d.filter((x: any) => ["Won", "Lost"].includes(x.stage)).length;
        const winRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;
        const overdueTasks = t.filter((x: any) => x.due_date && x.due_date < today);
        const systemPrompt = `You are EIDEN AI, an intelligent BMS assistant for Eiden Group — a growth engineering and revenue architecture firm.
Your role: Help employees manage their work, monitor tasks, analyze deals, track pipeline health, and make smart decisions. Be concise, professional, and data-driven.
## LIVE BMS DATA (Today: ${today})
**Pipeline:** $${pipelineValue.toLocaleString()} total value
**Active Deals:** ${d.filter((x: any) => !["Won","Lost"].includes(x.stage)).length} | **Win Rate:** ${winRate}%
**Overdue Tasks:** ${overdueTasks.length}
**ACTIVE TASKS (${t.length}) — use these IDs for updates/deletes:**
${t.map((x: any) => `- [ID:${x.id}] [${x.priority}${x.due_date < today ? " OVERDUE" : ""}] ${x.title} → ${x.assignee} (due: ${x.due_date}, ${x.status})`).join("\n") || "None"}
**RECENT DEALS — use these IDs for updates/deletes:**
${d.map((x: any) => `- [ID:${x.id}] ${x.title}: $${(x.value || 0).toLocaleString()} [${x.stage}] risk:${x.risk_score}% contact:${(x.contacts as any)?.name || "N/A"}`).join("\n") || "None"}
**CONTACTS — use these IDs for updates/deletes:**
${contacts.map((x: any) => `- [ID:${x.id}] ${x.name} | ${x.company || "No company"} | ${x.email || "No email"} | ${x.status}`).join("\n") || "None"}
**KNOWLEDGE BASE:**
${kb.map((k: any) => `[${k.category}] ${k.title}: ${k.content.slice(0, 120)}...`).join("\n")}
## CAPABILITIES — respond with ONE JSON action block when the user wants to create/update/delete data:
Create task:   {"action":"create_task","data":{"title":"...","assignee":"...","due_date":"YYYY-MM-DD","priority":"High|Medium|Low","description":"..."}}
Update task:   {"action":"update_task","data":{"id":123,"status":"Pending|In Progress|Completed","priority":"High|Medium|Low","due_date":"YYYY-MM-DD","assignee":"..."}}
Delete task:   {"action":"delete_task","data":{"id":123}}
Create deal:   {"action":"create_deal","data":{"title":"...","value":0,"stage":"Lead|Proposal|Negotiation|Won|Lost"}}
Update deal:   {"action":"update_deal","data":{"id":123,"stage":"...","value":0,"notes":"..."}}
Delete deal:   {"action":"delete_deal","data":{"id":123}}
Create contact: {"action":"create_contact","data":{"name":"...","company":"...","email":"...","status":"Active|Prospect|Inactive","source":"..."}}
Update contact: {"action":"update_contact","data":{"id":123,"status":"...","company":"...","email":"...","notes":"..."}}
Delete contact: {"action":"delete_contact","data":{"id":123}}
## GUIDELINES
- Be concise, highlight overdue tasks and high-risk deals proactively
- For briefings, use bullet points
- Always ground analysis in the actual data provided above
- When updating/deleting, use the exact numeric ID from the data above
- Only include fields you want to change in update actions`;
        try {
          const text = await sendToAI(systemPrompt, messages.map((m: any) => ({ role: m.role, content: String(m.content) })), provider);
          return res.json({ text });
        } catch (err: any) {
          return res.status(500).json({ error: "AI request failed", details: err.message });
        }
      }
    }

    // ─── Push notifications ────────────────────────────────────────────────────
    if (r0 === "push") {
      // GET /api/push/vapid-key
      if (r1 === "vapid-key" && method === "GET") {
        return res.json({ publicKey: vapidPublicKey });
      }
      // POST /api/push/subscribe
      if (r1 === "subscribe" && method === "POST") {
        const { userId, subscription } = req.body;
        if (!subscription?.endpoint) return res.status(400).json({ error: "subscription required" });
        const { endpoint, keys } = subscription;
        await supabase.from("push_subscriptions").upsert(
          { user_id: userId || null, endpoint, p256dh: keys.p256dh, auth: keys.auth },
          { onConflict: "endpoint" }
        );
        return res.json({ success: true });
      }
      // POST /api/push/send-meeting
      if (r1 === "send-meeting" && method === "POST") {
        const { title = "Team Meeting", message, workspaceId, sentBy } = req.body;
        if (!message) return res.status(400).json({ error: "message required" });
        // Always insert so Supabase realtime fires for all connected clients
        await supabase.from("meeting_alerts").insert({
          workspace_id: workspaceId ? Number(workspaceId) : null,
          sent_by: sentBy || null,
          title,
          message,
        });
        // Also send web-push to background devices
        const { data: subs } = await supabase.from("push_subscriptions").select("*");
        let sent = 0;
        for (const sub of subs || []) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({ title: `📅 ${title}`, body: message, icon: "/icon.png" })
            );
            sent++;
          } catch (e: any) {
            if (e.statusCode === 410 || e.statusCode === 404) {
              await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            }
          }
        }
        return res.json({ success: true, pushed: sent });
      }
      // POST /api/push/fcm-token
      if (r1 === "fcm-token" && method === "POST") {
        const { userId, token } = req.body;
        if (!userId || !token) return res.status(400).json({ error: "Missing userId or token" });
        try {
          await supabase.from("fcm_tokens").upsert({
            user_id: Number(userId),
            token,
            updated_at: new Date().toISOString()
          }, { onConflict: "user_id,token" });
          return res.json({ success: true });
        } catch (err: any) {
          return res.status(500).json({ error: err.message });
        }
      }
    }

    // ─── Seed ─────────────────────────────────────────────────────────────────
    if (r0 === "seed" && method === "POST") {
      const { count } = await supabase.from("users").select("*", { count: "exact", head: true });
      if (count && count > 0) return res.json({ message: "Already seeded", skipped: true });
      const { data: ws } = await supabase.from("workspaces").insert({ name: "Eiden Group" }).select().single();
      const adminPass = await bcrypt.hash("E!den@Gr0up#2026", 10);
      const defaultPass = await bcrypt.hash("Eid3nGrp#" + Math.random().toString(36).slice(2, 10), 10);
      const wsId = ws?.id;
      await supabase.from("users").insert([
        { name: "Oualid Laati",       email: "oualid@eiden.group",     role: "Admin",         workspace_id: wsId, username: "CEOAdmin",    password: adminPass },
        { name: "Hassan Elkhadiri",   email: "hassan@eiden.group",     role: "Brand Manager", workspace_id: wsId, username: "hassan",      password: defaultPass },
        { name: "Abdelhakim Akhidar", email: "abdelhakim@eiden.group", role: "Web Developer", workspace_id: wsId, username: "abdelhakim",  password: defaultPass },
      ]);
      await supabase.from("activity_log").insert({ user_id: null, action: "System initialized", related_to: "Eiden AI BMS", type: "system" });
      return res.json({ message: "Seeded successfully", workspace_id: wsId });
    }

    res.status(404).json({ error: "Not found" });
  } catch (err: any) {
    console.error("API error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
}
