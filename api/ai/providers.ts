import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const { data } = await supabase
      .from("global_settings")
      .select("ai_provider")
      .eq("id", 1)
      .maybeSingle();
    const active = data?.ai_provider || process.env.AI_PROVIDER || "groq";
    const list = [
      { id: "claude",   name: "Claude (Anthropic)", model: "claude-sonnet-4-6",       available: !!process.env.ANTHROPIC_API_KEY },
      { id: "groq",     name: "Groq (Llama 3.3)",   model: "llama-3.3-70b-versatile", available: !!process.env.GROQ_API_KEY },
      { id: "gemini",   name: "Gemini (Google)",     model: "gemini-1.5-flash",        available: !!process.env.GEMINI_API_KEY },
      { id: "deepseek", name: "DeepSeek",            model: "deepseek-chat",           available: !!process.env.DEEPSEEK_API_KEY },
    ];
    res.json({ active, providers: list });
  } else if (req.method === "POST") {
    const { provider } = req.body;
    const valid = ["claude", "groq", "gemini", "deepseek"];
    if (!valid.includes(provider)) return res.status(400).json({ error: "Invalid provider" });
    await supabase
      .from("global_settings")
      .upsert({ id: 1, ai_provider: provider }, { onConflict: "id" });
    res.json({ active: provider });
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
