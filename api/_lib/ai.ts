import Anthropic from "@anthropic-ai/sdk";

export async function sendToAI(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  provider: string
): Promise<string> {
  switch (provider) {
    case "claude": {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });
      const c = resp.content[0];
      return c.type === "text" ? c.text : "Unable to generate response.";
    }
    case "groq":
    case "deepseek": {
      const isGroq = provider === "groq";
      const baseUrl = isGroq ? "https://api.groq.com/openai/v1" : "https://api.deepseek.com/v1";
      const apiKey = isGroq ? process.env.GROQ_API_KEY : process.env.DEEPSEEK_API_KEY;
      const model = isGroq ? "llama-3.3-70b-versatile" : "deepseek-chat";
      if (!apiKey) throw new Error(`${provider.toUpperCase()}_API_KEY not set`);
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
      });
      const data = (await resp.json()) as any;
      if (!resp.ok) throw new Error(data.error?.message || "API error");
      return data.choices[0].message.content;
    }
    case "gemini": {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY not set");
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
            systemInstruction: { parts: [{ text: systemPrompt }] },
          }),
        }
      );
      const data = (await resp.json()) as any;
      if (!resp.ok) throw new Error(data.error?.message || "Gemini API error");
      return data.candidates[0].content.parts[0].text;
    }
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}
