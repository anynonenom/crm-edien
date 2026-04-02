import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const workspaceId = Number(req.query.workspace_id || 1);
  const clientId = process.env.ZOOM_CLIENT_ID;
  const redirectUri =
    process.env.ZOOM_REDIRECT_URI ||
    `https://${req.headers.host}/api/zoom/callback`;
  if (!clientId) return res.status(500).json({ error: "ZOOM_CLIENT_ID not configured in .env" });
  const url = `https://zoom.us/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${workspaceId}`;
  res.redirect(url);
}
