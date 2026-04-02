import type { VercelRequest, VercelResponse } from "@vercel/node";
import supabase from "../_lib/supabase";
import { logActivity } from "../_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error } = req.query;
  if (error || !code) return res.redirect("/?zoom=error");
  const workspaceId = Number(state || 1);
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const redirectUri =
    process.env.ZOOM_REDIRECT_URI || `https://${req.headers.host}/api/zoom/callback`;
  if (!clientId || !clientSecret) return res.redirect("/?zoom=error");
  try {
    const tokenResp = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResp.ok) return res.redirect("/?zoom=error");
    const tokenData = (await tokenResp.json()) as any;
    const userResp = await fetch("https://api.zoom.us/v2/users/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = userResp.ok ? ((await userResp.json()) as any) : {};
    const expiresAt = Date.now() + tokenData.expires_in * 1000;
    await supabase.from("zoom_tokens").upsert(
      {
        workspace_id: workspaceId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        zoom_user_id: userData.id || "",
        zoom_email: userData.email || "",
      },
      { onConflict: "workspace_id" }
    );
    await logActivity(1, "Connected Zoom account", userData.email || "", "integration");
    res.redirect("/?zoom=connected");
  } catch (err) {
    console.error("Zoom callback error:", err);
    res.redirect("/?zoom=error");
  }
}
