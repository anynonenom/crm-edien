import supabase from "./supabase";

export async function getZoomAccessToken(workspaceId: number): Promise<string | null> {
  const { data: row } = await supabase
    .from("zoom_tokens")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!row) return null;
  if (Date.now() < row.expires_at - 60000) return row.access_token;

  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const resp = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: row.refresh_token }),
    });
    if (!resp.ok) {
      await supabase.from("zoom_tokens").delete().eq("workspace_id", workspaceId);
      return null;
    }
    const data = (await resp.json()) as any;
    const expiresAt = Date.now() + data.expires_in * 1000;
    await supabase
      .from("zoom_tokens")
      .update({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expiresAt })
      .eq("workspace_id", workspaceId);
    return data.access_token;
  } catch {
    return null;
  }
}
