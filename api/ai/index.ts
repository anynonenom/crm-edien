import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";
import { sendToAI } from "../_lib/ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: "messages array is required" });

  // Get active provider from global_settings
  const { data: settings } = await supabase
    .from("global_settings")
    .select("ai_provider")
    .eq("id", 1)
    .maybeSingle();
  const provider = settings?.ai_provider || process.env.AI_PROVIDER || "groq";

  const today = new Date().toISOString().split("T")[0];
  const [{ data: dealsData }, { data: tasksRaw }, { data: kbData }] = await Promise.all([
    supabase
      .from("deals")
      .select("title, value, stage, risk_score, contacts(name)")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("tasks")
      .select("title, status, priority, due_date, users!assignee_id(name)")
      .neq("status", "Completed")
      .order("due_date")
      .limit(15),
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
  const activeTasks = t;

  const systemPrompt = `You are EIDEN AI, an intelligent CRM assistant for Eiden Group — a growth engineering and revenue architecture firm.

Your role: Help employees manage their work, monitor tasks, analyze deals, track pipeline health, and make smart decisions. Be concise, professional, and data-driven.

## LIVE CRM DATA (Today: ${today})
**Pipeline:** $${pipelineValue.toLocaleString()} total value
**Active Deals:** ${d.filter((x: any) => !["Won", "Lost"].includes(x.stage)).length} | **Win Rate:** ${winRate}%
**Overdue Tasks:** ${overdueTasks.length}

**ACTIVE TASKS (${activeTasks.length}):**
${activeTasks.map((t: any) => `- [${t.priority}${t.due_date < today ? " OVERDUE" : ""}] ${t.title} → ${t.assignee} (due: ${t.due_date}, ${t.status})`).join("\n") || "None"}

**RECENT DEALS:**
${d.map((x: any) => `- ${x.title}: $${(x.value || 0).toLocaleString()} [${x.stage}] risk:${x.risk_score}% contact:${(x.contacts as any)?.name || "N/A"}`).join("\n") || "None"}

**KNOWLEDGE BASE:**
${kb.map((k: any) => `[${k.category}] ${k.title}: ${k.content.slice(0, 120)}...`).join("\n")}

## CAPABILITIES
You can interpret natural language to take actions. When a user wants to create or update data, respond with a JSON action block anywhere in your response:

For creating a task:
{"action":"create_task","data":{"title":"...","assignee":"...","due_date":"YYYY-MM-DD","priority":"High|Medium|Low","description":"..."}}

For creating a deal:
{"action":"create_deal","data":{"title":"...","value":0,"stage":"Lead|Proposal|Negotiation"}}

You can include normal text AND an action block in the same response.

## GUIDELINES
- Be concise — no lengthy preambles
- Highlight overdue tasks and high-risk deals proactively
- For briefings, use bullet points
- If you don't know something, say so clearly
- Always ground analysis in the actual data provided above`;

  try {
    const text = await sendToAI(
      systemPrompt,
      messages.map((m: any) => ({ role: m.role, content: String(m.content) })),
      provider
    );
    res.json({ text });
  } catch (err: any) {
    console.error(`AI error [${provider}]:`, err.message);
    res.status(500).json({ error: "AI request failed", details: err.message });
  }
}
