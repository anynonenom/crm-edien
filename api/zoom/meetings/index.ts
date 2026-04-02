import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getZoomAccessToken } from "../../_lib/zoom";
import { logActivity } from "../../_lib/helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const workspaceId = Number(req.query.workspace_id || 0);
    if (!workspaceId) return res.status(400).json({ error: "workspace_id required" });
    const token = await getZoomAccessToken(workspaceId);
    if (!token) return res.status(401).json({ error: "Zoom not connected", connected: false });
    try {
      const resp = await fetch(
        "https://api.zoom.us/v2/users/me/meetings?type=upcoming&page_size=10",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!resp.ok) return res.status(resp.status).json({ error: "Zoom API error" });
      const data = (await resp.json()) as any;
      res.json(data.meetings || []);
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else if (req.method === "POST") {
    const { workspace_id, topic, start_time, duration = 60, agenda = "" } = req.body;
    const workspaceId = Number(workspace_id || 0);
    if (!workspaceId || !topic || !start_time)
      return res.status(400).json({ error: "workspace_id, topic, start_time required" });
    const token = await getZoomAccessToken(workspaceId);
    if (!token) return res.status(401).json({ error: "Zoom not connected" });
    try {
      const resp = await fetch("https://api.zoom.us/v2/users/me/meetings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          type: 2,
          start_time,
          duration: Number(duration),
          agenda,
          settings: { host_video: true, participant_video: true, join_before_host: true },
        }),
      });
      if (!resp.ok) {
        const e = await resp.json();
        return res.status(resp.status).json({ error: "Zoom API error", details: e });
      }
      const meeting = (await resp.json()) as any;
      await logActivity(1, `Scheduled Zoom meeting: ${topic}`, meeting.join_url, "integration");
      res.json(meeting);
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
