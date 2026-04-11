#!/usr/bin/env python3
"""Patch App.tsx: analytics for all roles, AI chat history sidebar, time tracker."""
import re

with open("src/App.tsx", "r") as f:
    src = f.read()

results = []

# ── 1. PERMISSIONS: add analytics to ALL roles' tabs ────────────────────────
old_perms = '''const PERMISSIONS: Record<string, { tabs: string[]; canCreate: boolean; canDelete: boolean; canViewAnalytics: boolean; canAssignAll: boolean; ownTasksOnly: boolean }> = {
  "Admin":               { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","knowledge_base","admin"], canCreate: true,  canDelete: true,  canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Eiden HQ":            { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","knowledge_base"],          canCreate: true,  canDelete: true,  canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Eiden Global":        { tabs: ["dashboard","pipeline","contacts","clients","tasks","knowledge_base"],                      canCreate: true,  canDelete: false, canViewAnalytics: false, canAssignAll: true,  ownTasksOnly: false },
  "Operational Manager": { tabs: ["dashboard","pipeline","contacts","clients","tasks","knowledge_base"],                      canCreate: true,  canDelete: true,  canViewAnalytics: false, canAssignAll: true,  ownTasksOnly: false },
  "Brand Manager":       { tabs: ["dashboard","tasks","knowledge_base"],                                            canCreate: true,  canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Designer":            { tabs: ["dashboard","tasks","knowledge_base"],                                            canCreate: true,  canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Video Editor":        { tabs: ["dashboard","tasks","knowledge_base"],                                            canCreate: true,  canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Web Developer":       { tabs: ["dashboard","tasks","knowledge_base"],                                            canCreate: true,  canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Content Creator":     { tabs: ["dashboard","tasks","knowledge_base"],                                            canCreate: true,  canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Marketing Strategy":  { tabs: ["dashboard","tasks","knowledge_base"],                                            canCreate: false, canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Sales":               { tabs: ["dashboard","pipeline","contacts","clients","tasks","knowledge_base"],                      canCreate: true,  canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Commercial":          { tabs: ["dashboard","pipeline","contacts","clients","tasks","knowledge_base"],                      canCreate: true,  canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Solution Architect":  { tabs: ["dashboard","tasks","knowledge_base"],                                            canCreate: true,  canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
};'''

new_perms = '''const PERMISSIONS: Record<string, { tabs: string[]; canCreate: boolean; canDelete: boolean; canViewAnalytics: boolean; canAssignAll: boolean; ownTasksOnly: boolean }> = {
  "Admin":               { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","knowledge_base","admin"], canCreate: true,  canDelete: true,  canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Eiden HQ":            { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","knowledge_base"],          canCreate: true,  canDelete: true,  canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Eiden Global":        { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","knowledge_base"],          canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Operational Manager": { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","knowledge_base"],          canCreate: true,  canDelete: true,  canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Brand Manager":       { tabs: ["dashboard","tasks","analytics","knowledge_base"],                                          canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Designer":            { tabs: ["dashboard","tasks","analytics","knowledge_base"],                                          canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Video Editor":        { tabs: ["dashboard","tasks","analytics","knowledge_base"],                                          canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Web Developer":       { tabs: ["dashboard","tasks","analytics","knowledge_base"],                                          canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Content Creator":     { tabs: ["dashboard","tasks","analytics","knowledge_base"],                                          canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Marketing Strategy":  { tabs: ["dashboard","tasks","analytics","knowledge_base"],                                          canCreate: false, canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Sales":               { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","knowledge_base"],          canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Commercial":          { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","knowledge_base"],          canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Solution Architect":  { tabs: ["dashboard","tasks","analytics","knowledge_base"],                                          canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
};'''

if old_perms in src:
    src = src.replace(old_perms, new_perms)
    results.append("1. PERMISSIONS updated: analytics for all roles ✓")
else:
    results.append("1. PERMISSIONS: NOT FOUND ✗")

# ── 2. Add TimeLog interface after Client interface ───────────────────────────
old_iface = '''interface Workspace { id: number; name: string; }'''
new_iface = '''interface TimeLog {
  id: number; user_id: number; user_name: string;
  task_id?: number; task_title?: string;
  start_time: string; end_time?: string;
  duration_minutes: number; notes?: string;
  workspace_id: number; created_at?: string;
}
interface Workspace { id: number; name: string; }'''

if old_iface in src:
    src = src.replace(old_iface, new_iface)
    results.append("2. TimeLog interface added ✓")
else:
    results.append("2. TimeLog interface: NOT FOUND ✗")

# ── 3. Add timer state variables after overdueReason state ───────────────────
old_state = '''  // Team chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);'''
new_state = '''  // Time tracker
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState<Date | null>(null);
  const [timerElapsed, setTimerElapsed] = useState(0); // seconds
  const [timerTaskId, setTimerTaskId] = useState<number | "">("");
  const [timerLogId, setTimerLogId] = useState<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Team chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);'''

if old_state in src:
    src = src.replace(old_state, new_state)
    results.append("3. Timer state variables added ✓")
else:
    results.append("3. Timer state: NOT FOUND ✗")

# ── 4. Add timeLogs fetch to fetchData ─────────────────────────────────────
old_fetch = '''      const [statsRes, dealsRes, tasksRes, contactsRes, usersRes, workspacesRes, knowledgeRes, activityRes, financialsRes, clientsRes] = await Promise.all([
        fetch("/api/stats"), fetch("/api/deals"), fetch("/api/tasks"),
        fetch("/api/contacts"), fetch("/api/users"), fetch("/api/workspaces"),
        fetch("/api/knowledge"), fetch("/api/activity"), fetch("/api/financials"),
        fetch("/api/clients")
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (dealsRes.ok) setDeals(await dealsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (contactsRes.ok) setContacts(await contactsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (workspacesRes.ok) setWorkspaces(await workspacesRes.json());
      if (knowledgeRes.ok) setKnowledge(await knowledgeRes.json());
      if (activityRes.ok) setActivities(await activityRes.json());
      if (clientsRes.ok) setClients(await clientsRes.json());
      if (financialsRes.ok) setFinancials(await financialsRes.json());'''

new_fetch = '''      const [statsRes, dealsRes, tasksRes, contactsRes, usersRes, workspacesRes, knowledgeRes, activityRes, financialsRes, clientsRes, timeLogsRes] = await Promise.all([
        fetch("/api/stats"), fetch("/api/deals"), fetch("/api/tasks"),
        fetch("/api/contacts"), fetch("/api/users"), fetch("/api/workspaces"),
        fetch("/api/knowledge"), fetch("/api/activity"), fetch("/api/financials"),
        fetch("/api/clients"), fetch("/api/time-logs")
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (dealsRes.ok) setDeals(await dealsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (contactsRes.ok) setContacts(await contactsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (workspacesRes.ok) setWorkspaces(await workspacesRes.json());
      if (knowledgeRes.ok) setKnowledge(await knowledgeRes.json());
      if (activityRes.ok) setActivities(await activityRes.json());
      if (clientsRes.ok) setClients(await clientsRes.json());
      if (financialsRes.ok) setFinancials(await financialsRes.json());
      if (timeLogsRes.ok) setTimeLogs(await timeLogsRes.json());'''

if old_fetch in src:
    src = src.replace(old_fetch, new_fetch)
    results.append("4. fetchData updated with time-logs ✓")
else:
    results.append("4. fetchData: NOT FOUND ✗")

# ── 5. Add timer functions after submitOverdueReason ─────────────────────────
old_after_overdue = '''  // ─── Client Actions ───────────────────────────────────────────────────────────'''
new_after_overdue = '''  // ─── Time Tracker ────────────────────────────────────────────────────────────
  const startTimer = async () => {
    if (!currentUser || !currentWorkspace) return;
    const now = new Date();
    const selectedTask = filteredTasks.find(t => t.id === Number(timerTaskId));
    const res = await fetch("/api/time-logs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.id, user_name: currentUser.name,
        task_id: timerTaskId || null, task_title: selectedTask?.title || "",
        start_time: now.toISOString(), workspace_id: currentWorkspace.id
      })
    });
    if (res.ok) {
      const { id } = await res.json();
      setTimerLogId(id);
      setTimerStart(now);
      setTimerElapsed(0);
      setTimerRunning(true);
      timerIntervalRef.current = setInterval(() => {
        setTimerElapsed(e => e + 1);
      }, 1000);
    }
  };

  const stopTimer = async () => {
    if (!timerLogId || !timerStart) return;
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    const end = new Date();
    const durationMinutes = Math.round((end.getTime() - timerStart.getTime()) / 60000);
    await fetch(`/api/time-logs/${timerLogId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ end_time: end.toISOString(), duration_minutes: durationMinutes })
    });
    setTimerRunning(false);
    setTimerStart(null);
    setTimerLogId(null);
    setTimerElapsed(0);
    fetchData();
  };

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
      : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };

  // ─── Client Actions ───────────────────────────────────────────────────────────'''

if old_after_overdue in src:
    src = src.replace(old_after_overdue, new_after_overdue)
    results.append("5. Timer functions added ✓")
else:
    results.append("5. Timer functions: NOT FOUND ✗")

# ── 6. Add timer cleanup useEffect after existing useEffects ─────────────────
old_fetchinterval = '''  useEffect(() => {
    if (!isLoggedIn) return;
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isLoggedIn, fetchData]);'''

new_fetchinterval = '''  useEffect(() => {
    if (!isLoggedIn) return;
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isLoggedIn, fetchData]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, []);'''

if old_fetchinterval in src:
    src = src.replace(old_fetchinterval, new_fetchinterval)
    results.append("6. Timer cleanup effect added ✓")
else:
    results.append("6. Timer cleanup: NOT FOUND ✗")

# ── 7. Timer sidebar widget — insert BEFORE overdue notification in sidebar ──
old_sidebar_overdue = '''        {/* Overdue notification in sidebar */}
        {(() => {
          const myOverdue = filteredTasks.filter(t => isOverdue(t.due_date, t.status) && !t.overdue_reason);'''

new_sidebar_overdue = '''        {/* Time Tracker widget */}
        {(() => {
          const todayLogs = timeLogs.filter(l =>
            l.user_id === currentUser?.id &&
            l.end_time &&
            new Date(l.start_time).toDateString() === new Date().toDateString()
          );
          const todayMinutes = todayLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
          const todayHrs = Math.floor(todayMinutes / 60);
          const todayMins = todayMinutes % 60;
          const myTasks = filteredTasks.filter(t => t.assignee_id === currentUser?.id && t.status !== "Completed");
          return (
            <div className="mx-4 mb-3 p-3" style={{ background: "rgba(244,235,208,0.05)", border: "1px solid rgba(244,235,208,0.1)" }}>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(244,235,208,0.45)" }}>Time Tracker</span>
                {timerRunning && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#4ade80" }} />}
              </div>
              {timerRunning ? (
                <div className="space-y-2">
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 700, color: "#4ade80", letterSpacing: "1px" }}>
                    {formatElapsed(timerElapsed)}
                  </div>
                  {filteredTasks.find(t => t.id === Number(timerTaskId)) && (
                    <div className="text-[0.65rem] truncate" style={{ color: "rgba(244,235,208,0.5)" }}>
                      {filteredTasks.find(t => t.id === Number(timerTaskId))?.title}
                    </div>
                  )}
                  <button onClick={stopTimer}
                    className="w-full py-1.5 text-[0.65rem] font-bold uppercase tracking-wider"
                    style={{ background: "rgba(139,58,58,0.35)", border: "1px solid rgba(139,58,58,0.5)", color: "rgba(220,150,150,0.9)", cursor: "pointer" }}>
                    ■ Stop
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <select value={timerTaskId} onChange={e => setTimerTaskId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full outline-none text-[0.65rem] px-2 py-1"
                    style={{ background: "rgba(244,235,208,0.06)", border: "1px solid rgba(244,235,208,0.12)", color: "rgba(244,235,208,0.6)", fontFamily: "'Space Grotesk',sans-serif" }}>
                    <option value="" style={{ background: "#122620" }}>No task selected</option>
                    {myTasks.map(t => <option key={t.id} value={t.id} style={{ background: "#122620" }}>{t.title.slice(0,30)}</option>)}
                  </select>
                  <button onClick={startTimer}
                    className="w-full py-1.5 text-[0.65rem] font-bold uppercase tracking-wider"
                    style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", color: "rgba(74,222,128,0.9)", cursor: "pointer" }}>
                    ▶ Clock In
                  </button>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(244,235,208,0.3)", textAlign: "center" }}>
                    Today: {todayHrs}h {todayMins}m
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Overdue notification in sidebar */}
        {(() => {
          const myOverdue = filteredTasks.filter(t => isOverdue(t.due_date, t.status) && !t.overdue_reason);'''

if old_sidebar_overdue in src:
    src = src.replace(old_sidebar_overdue, new_sidebar_overdue)
    results.append("7. Timer sidebar widget added ✓")
else:
    results.append("7. Timer sidebar widget: NOT FOUND ✗")

# ── 8. Replace "Recent Activity" on dashboard with AI Chat History ───────────
old_activity_panel = '''                    {/* Recent activity */}
                    <div class="eiden-card overflow-hidden flex flex-col lg:flex-1 lg:min-h-0">
                      <div class="shrink-0 px-3 sm:px-4 py-2.5" style={{ borderBottom: "1px solid rgba(18,38,32,0.06)" }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Recent Activity</span>
                      </div>
                      <div class="overflow-y-auto p-3 space-y-1 max-h-52 sm:max-h-64 lg:max-h-none lg:flex-1">
                        {activities.slice(0, 15).map(a => (
                          <div key={a.id} class="flex gap-2 py-2 px-2" style={{ borderLeft: "1.5px solid rgba(18,38,32,0.1)" }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "rgba(18,38,32,0.3)", flexShrink: 0, width: 40 }}>{a.time}</span>
                            <div class="min-w-0">
                              <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "var(--deep-forest)" }}>{a.action}</span>
                              {a.related_to && <span style={{ fontSize: "0.72rem", color: "rgba(18,38,32,0.4)", marginLeft: 4 }}>· {a.related_to}</span>}
                            </div>
                          </div>
                        ))}
                      </div>'''

# Try with className instead
old_activity_panel_tsx = '''                    {/* Recent activity */}
                    <div className="eiden-card overflow-hidden flex flex-col lg:flex-1 lg:min-h-0">
                      <div className="shrink-0 px-3 sm:px-4 py-2.5" style={{ borderBottom: "1px solid rgba(18,38,32,0.06)" }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Recent Activity</span>
                      </div>
                      <div className="overflow-y-auto p-3 space-y-1 max-h-52 sm:max-h-64 lg:max-h-none lg:flex-1">
                        {activities.slice(0, 15).map(a => (
                          <div key={a.id} className="flex gap-2 py-2 px-2" style={{ borderLeft: "1.5px solid rgba(18,38,32,0.1)" }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "rgba(18,38,32,0.3)", flexShrink: 0, width: 40 }}>{a.time}</span>
                            <div className="min-w-0">
                              <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "var(--deep-forest)" }}>{a.action}</span>
                              {a.related_to && <span style={{ fontSize: "0.72rem", color: "rgba(18,38,32,0.4)", marginLeft: 4 }}>· {a.related_to}</span>}
                            </div>
                          </div>
                        ))}
                      </div>'''

new_activity_panel = '''                    {/* AI Chat History */}
                    <div className="eiden-card overflow-hidden flex flex-col lg:flex-1 lg:min-h-0">
                      <div className="shrink-0 px-3 sm:px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(18,38,32,0.06)" }}>
                        <div className="flex items-center gap-2">
                          <Bot size={12} style={{ color: "var(--deep-forest)", opacity: 0.5 }} />
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>AI Chat History</span>
                        </div>
                        {aiMessages.length > 0 && (
                          <button onClick={() => currentWorkspace && clearHistory(currentWorkspace.id)}
                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(18,38,32,0.3)", background: "none", border: "none", cursor: "pointer", letterSpacing: "1px", textTransform: "uppercase" }}>
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="overflow-y-auto p-3 space-y-2 max-h-52 sm:max-h-64 lg:max-h-none lg:flex-1">
                        {aiMessages.length === 0 ? (
                          <div className="text-center py-6">
                            <Bot size={24} className="mx-auto mb-2 opacity-15" style={{ color: "var(--deep-forest)" }} />
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.3)" }}>No AI conversations yet</div>
                          </div>
                        ) : (
                          [...aiMessages].reverse().map((msg, i) => (
                            <div key={i} className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => { const el = document.querySelector(".ai-chat-scroll"); if (el) el.scrollIntoView({ behavior: "smooth" }); }}
                              style={{ borderLeft: `1.5px solid ${msg.role === "user" ? "var(--deep-forest)" : "rgba(18,38,32,0.2)"}`, paddingLeft: 8, paddingTop: 4, paddingBottom: 4 }}>
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(18,38,32,0.35)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 2 }}>
                                {msg.role === "user" ? "You" : "Eiden AI"}
                                <span className="ml-2">{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                              <div style={{ fontSize: "0.72rem", color: "var(--deep-forest)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                {msg.content}
                              </div>
                            </div>
                          ))
                        )}
                      </div>'''

if old_activity_panel_tsx in src:
    src = src.replace(old_activity_panel_tsx, new_activity_panel)
    results.append("8. AI Chat History panel added (tsx) ✓")
elif old_activity_panel in src:
    src = src.replace(old_activity_panel, new_activity_panel)
    results.append("8. AI Chat History panel added (class) ✓")
else:
    results.append("8. Activity panel: NOT FOUND ✗")

# ── 9. Expand analytics tab — replace current analytics section ──────────────
old_analytics_end = '''                  {/* Risk overview */}
                  <div className="eiden-card p-6">
                    <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Deal Risk Overview</div>
                    <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Active deals sorted by risk</div>
                    <div className="space-y-3">
                      {filteredDeals.filter(d => d.stage !== "Won" && d.stage !== "Lost")
                        .sort((a, b) => b.risk_score - a.risk_score).slice(0, 6).map(d => {
                          const riskColor = d.risk_score > 60 ? "var(--danger)" : d.risk_score > 30 ? "var(--warning)" : "var(--success)";
                          return (
                            <div key={d.id} className="flex items-center gap-3 text-[0.75rem]">
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", fontWeight: 600, textAlign: "right", flexShrink: 0, width: 36, color: riskColor }}>{d.risk_score}%</span>
                              <div className="flex-1">
                                <div className="font-medium truncate" style={{ color: "var(--deep-forest)" }}>{d.title}</div>
                                <div className="h-1.5 mt-1" style={{ background: "rgba(18,38,32,0.06)" }}>
                                  <div className="h-full" style={{ width: `${d.risk_score}%`, background: riskColor }} />
                                </div>
                              </div>
                              <span className="text-[var(--gris)] text-[0.65rem] shrink-0">${d.value.toLocaleString()}</span>
                            </div>
                          );
                        })}
                      {filteredDeals.filter(d => d.stage !== "Won" && d.stage !== "Lost").length === 0 && (
                        <div className="text-[0.75rem] text-[var(--gris)]">No active deals.</div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}'''

new_analytics_extra = '''                  {/* Risk overview */}
                  <div className="eiden-card p-6">
                    <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Deal Risk Overview</div>
                    <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Active deals sorted by risk</div>
                    <div className="space-y-3">
                      {filteredDeals.filter(d => d.stage !== "Won" && d.stage !== "Lost")
                        .sort((a, b) => b.risk_score - a.risk_score).slice(0, 6).map(d => {
                          const riskColor = d.risk_score > 60 ? "var(--danger)" : d.risk_score > 30 ? "var(--warning)" : "var(--success)";
                          return (
                            <div key={d.id} className="flex items-center gap-3 text-[0.75rem]">
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", fontWeight: 600, textAlign: "right", flexShrink: 0, width: 36, color: riskColor }}>{d.risk_score}%</span>
                              <div className="flex-1">
                                <div className="font-medium truncate" style={{ color: "var(--deep-forest)" }}>{d.title}</div>
                                <div className="h-1.5 mt-1" style={{ background: "rgba(18,38,32,0.06)" }}>
                                  <div className="h-full" style={{ width: `${d.risk_score}%`, background: riskColor }} />
                                </div>
                              </div>
                              <span className="text-[var(--gris)] text-[0.65rem] shrink-0">${d.value.toLocaleString()}</span>
                            </div>
                          );
                        })}
                      {filteredDeals.filter(d => d.stage !== "Won" && d.stage !== "Lost").length === 0 && (
                        <div className="text-[0.75rem] text-[var(--gris)]">No active deals.</div>
                      )}
                    </div>
                  </div>

                  {/* ── Tasks Analytics ── */}
                  <div className="eiden-card p-6">
                    <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>My Tasks Overview</div>
                    <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Your personal task breakdown</div>
                    {(() => {
                      const myTasks = tasks.filter(t => t.assignee_id === currentUser?.id);
                      const byStatus = ["Pending","In Progress","Completed"].map(s => ({ label: s, count: myTasks.filter(t => t.status === s).length }));
                      const byPriority = ["High","Medium","Low"].map(p => ({ label: p, count: myTasks.filter(t => t.priority === p).length, color: p === "High" ? "var(--danger)" : p === "Medium" ? "var(--warning)" : "var(--gris)" }));
                      const overdueCount = myTasks.filter(t => isOverdue(t.due_date, t.status)).length;
                      const completionRate = myTasks.length > 0 ? Math.round((myTasks.filter(t => t.status === "Completed").length / myTasks.length) * 100) : 0;
                      return (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3" style={{ borderLeft: "3px solid var(--deep-forest)" }}>
                              <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Total Assigned</div>
                              <div style={{ fontSize: "2rem", fontWeight: 300, color: "var(--deep-forest)", lineHeight: 1 }}>{myTasks.length}</div>
                            </div>
                            <div className="p-3" style={{ borderLeft: `3px solid ${overdueCount > 0 ? "var(--danger)" : "var(--success)"}` }}>
                              <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Completion Rate</div>
                              <div style={{ fontSize: "2rem", fontWeight: 300, color: overdueCount > 0 ? "var(--danger)" : "var(--success)", lineHeight: 1 }}>{completionRate}%</div>
                            </div>
                          </div>
                          <div>
                            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-2">By Status</div>
                            <div className="space-y-2">
                              {byStatus.map(s => (
                                <div key={s.label} className="flex items-center gap-3">
                                  <span className="text-[0.72rem] font-medium w-20" style={{ color: "var(--deep-forest)" }}>{s.label}</span>
                                  <div className="flex-1 h-1.5" style={{ background: "rgba(18,38,32,0.07)" }}>
                                    <div className="h-full" style={{ width: myTasks.length > 0 ? `${(s.count/myTasks.length)*100}%` : "0%", background: "var(--deep-forest)", minWidth: s.count > 0 ? 4 : 0 }} />
                                  </div>
                                  <span className="text-[0.68rem] font-bold w-4 text-right" style={{ color: "var(--gris)" }}>{s.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-2">By Priority</div>
                            <div className="flex gap-3">
                              {byPriority.map(p => (
                                <div key={p.label} className="flex-1 p-2 text-center" style={{ border: `1px solid ${p.color}`, color: p.color }}>
                                  <div style={{ fontSize: "1.4rem", fontWeight: 300, lineHeight: 1 }}>{p.count}</div>
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", marginTop: 3 }}>{p.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* ── Contacts Analytics (if has access) ── */}
                  {perms.tabs.includes("contacts") && (
                    <div className="eiden-card p-6">
                      <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Contacts Overview</div>
                      <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Status & source breakdown</div>
                      <div className="space-y-4">
                        <div>
                          <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-2">By Status</div>
                          <div className="space-y-2">
                            {["Active","Prospect","Inactive"].map(s => {
                              const cnt = filteredContacts.filter(c => c.status === s).length;
                              const pct = filteredContacts.length > 0 ? (cnt / filteredContacts.length) * 100 : 0;
                              const col = s === "Active" ? "var(--success)" : s === "Prospect" ? "var(--warning)" : "var(--gris)";
                              return (
                                <div key={s} className="flex items-center gap-3">
                                  <span className="text-[0.72rem] font-medium w-20" style={{ color: col }}>{s}</span>
                                  <div className="flex-1 h-1.5" style={{ background: "rgba(18,38,32,0.07)" }}>
                                    <div className="h-full" style={{ width: `${pct}%`, background: col, minWidth: cnt > 0 ? 4 : 0 }} />
                                  </div>
                                  <span className="text-[0.68rem] font-bold w-4 text-right" style={{ color: "var(--gris)" }}>{cnt}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-2">By Source</div>
                          <div className="space-y-2">
                            {Array.from(new Set(filteredContacts.map(c => c.source).filter(Boolean))).slice(0,5).map(src => {
                              const cnt = filteredContacts.filter(c => c.source === src).length;
                              const pct = filteredContacts.length > 0 ? (cnt / filteredContacts.length) * 100 : 0;
                              return (
                                <div key={String(src)} className="flex items-center gap-3">
                                  <span className="text-[0.72rem] w-24 truncate" style={{ color: "var(--deep-forest)" }}>{src}</span>
                                  <div className="flex-1 h-1.5" style={{ background: "rgba(18,38,32,0.07)" }}>
                                    <div className="h-full" style={{ width: `${pct}%`, background: "var(--deep-forest)" }} />
                                  </div>
                                  <span className="text-[0.68rem] font-bold w-4 text-right" style={{ color: "var(--gris)" }}>{cnt}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="p-3" style={{ borderLeft: "3px solid var(--deep-forest)" }}>
                          <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Total LTV</div>
                          <div style={{ fontSize: "1.6rem", fontWeight: 300, color: "var(--deep-forest)", lineHeight: 1 }}>
                            ${filteredContacts.reduce((s, c) => s + (c.ltv || 0), 0).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Client Analytics (if has access) ── */}
                  {perms.tabs.includes("clients") && (
                    <div className="eiden-card p-6">
                      <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Client Portfolio</div>
                      <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Revenue & status distribution</div>
                      {(() => {
                        const wsClients = clients.filter(c => c.workspace_id === currentWorkspace?.id);
                        const totalMRR = wsClients.filter(c => c.status === "Active").reduce((s, c) => s + (c.monthly_value || 0), 0);
                        const byIndustry = Array.from(new Set(wsClients.map(c => c.industry).filter(Boolean)));
                        return (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3" style={{ borderLeft: "3px solid var(--success)" }}>
                                <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Monthly Revenue</div>
                                <div style={{ fontSize: "1.5rem", fontWeight: 300, color: "var(--success)", lineHeight: 1 }}>${totalMRR.toLocaleString()}</div>
                              </div>
                              <div className="p-3" style={{ borderLeft: "1.5px solid var(--deep-forest)" }}>
                                <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Active Clients</div>
                                <div style={{ fontSize: "1.5rem", fontWeight: 300, color: "var(--deep-forest)", lineHeight: 1 }}>{wsClients.filter(c => c.status === "Active").length}</div>
                              </div>
                            </div>
                            <div>
                              <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-2">By Status</div>
                              {["Active","At Risk","Onboarding","Churned"].map(s => {
                                const cnt = wsClients.filter(c => c.status === s).length;
                                const pct = wsClients.length > 0 ? (cnt / wsClients.length) * 100 : 0;
                                const col = s === "Active" ? "var(--success)" : s === "At Risk" ? "var(--danger)" : s === "Onboarding" ? "var(--warning)" : "var(--gris)";
                                return (
                                  <div key={s} className="flex items-center gap-3 mb-2">
                                    <span className="text-[0.72rem] font-medium w-20" style={{ color: col }}>{s}</span>
                                    <div className="flex-1 h-1.5" style={{ background: "rgba(18,38,32,0.07)" }}>
                                      <div className="h-full" style={{ width: `${pct}%`, background: col, minWidth: cnt > 0 ? 4 : 0 }} />
                                    </div>
                                    <span className="text-[0.68rem] font-bold w-4 text-right" style={{ color: "var(--gris)" }}>{cnt}</span>
                                  </div>
                                );
                              })}
                            </div>
                            {byIndustry.length > 0 && (
                              <div>
                                <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-2">By Industry</div>
                                {byIndustry.slice(0,5).map(ind => {
                                  const cnt = wsClients.filter(c => c.industry === ind).length;
                                  const pct = wsClients.length > 0 ? (cnt / wsClients.length) * 100 : 0;
                                  return (
                                    <div key={String(ind)} className="flex items-center gap-3 mb-2">
                                      <span className="text-[0.72rem] w-24 truncate" style={{ color: "var(--deep-forest)" }}>{ind}</span>
                                      <div className="flex-1 h-1.5" style={{ background: "rgba(18,38,32,0.07)" }}>
                                        <div className="h-full" style={{ width: `${pct}%`, background: "var(--deep-forest)" }} />
                                      </div>
                                      <span className="text-[0.68rem] font-bold w-4 text-right" style={{ color: "var(--gris)" }}>{cnt}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── Time Tracker Analytics (Admin/Eiden HQ/Ops Manager see all; others see own) ── */}
                  {(() => {
                    const isManager = ["Admin","Eiden HQ","Operational Manager","Eiden Global"].includes(currentUser?.role || "");
                    const relevantLogs = isManager
                      ? timeLogs.filter(l => l.workspace_id === currentWorkspace?.id && l.end_time)
                      : timeLogs.filter(l => l.user_id === currentUser?.id && l.end_time);
                    const todayStr = new Date().toDateString();
                    const todayLogs = relevantLogs.filter(l => new Date(l.start_time).toDateString() === todayStr);
                    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                    const weekLogs = relevantLogs.filter(l => new Date(l.start_time) >= weekStart);
                    const todayMins = todayLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
                    const weekMins = weekLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
                    const fmtTime = (mins: number) => `${Math.floor(mins/60)}h ${mins%60}m`;
                    return (
                      <div className="eiden-card p-6 lg:col-span-2">
                        <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>
                          {isManager ? "Team Time Tracker" : "My Time Log"}
                        </div>
                        <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>
                          {isManager ? "All employee time entries" : "Your tracked hours"}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                          <div className="p-3" style={{ borderLeft: "3px solid var(--deep-forest)" }}>
                            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Today</div>
                            <div style={{ fontSize: "1.4rem", fontWeight: 300, color: "var(--deep-forest)", lineHeight: 1 }}>{fmtTime(todayMins)}</div>
                          </div>
                          <div className="p-3" style={{ borderLeft: "1.5px solid var(--deep-forest)" }}>
                            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">This Week</div>
                            <div style={{ fontSize: "1.4rem", fontWeight: 300, color: "var(--deep-forest)", lineHeight: 1 }}>{fmtTime(weekMins)}</div>
                          </div>
                          <div className="p-3" style={{ borderLeft: "1.5px solid var(--deep-forest)" }}>
                            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Entries</div>
                            <div style={{ fontSize: "1.4rem", fontWeight: 300, color: "var(--deep-forest)", lineHeight: 1 }}>{relevantLogs.length}</div>
                          </div>
                          {isManager && (
                            <div className="p-3" style={{ borderLeft: "1.5px solid var(--deep-forest)" }}>
                              <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Active Now</div>
                              <div style={{ fontSize: "1.4rem", fontWeight: 300, color: timerRunning ? "var(--success)" : "var(--gris)", lineHeight: 1 }}>
                                {timerRunning ? "1" : "0"}
                              </div>
                            </div>
                          )}
                        </div>
                        {isManager ? (
                          <div className="space-y-2">
                            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-2">By Employee (This Week)</div>
                            {users.filter(u => u.workspace_id === currentWorkspace?.id).map(u => {
                              const uMins = weekLogs.filter(l => l.user_id === u.id).reduce((s, l) => s + (l.duration_minutes || 0), 0);
                              const maxMins = Math.max(...users.map(ux => weekLogs.filter(l => l.user_id === ux.id).reduce((s, l) => s + (l.duration_minutes || 0), 0)), 1);
                              return (
                                <div key={u.id} className="flex items-center gap-3">
                                  <div className="w-24 shrink-0">
                                    <div className="text-[0.72rem] font-medium truncate" style={{ color: "var(--deep-forest)" }}>{u.name.split(" ")[0]}</div>
                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(18,38,32,0.3)" }}>{fmtTime(uMins)}</div>
                                  </div>
                                  <div className="flex-1 h-2" style={{ background: "rgba(18,38,32,0.06)" }}>
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${(uMins/maxMins)*100}%` }} className="h-full" style={{ background: "var(--deep-forest)" }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-2">Recent Entries</div>
                            {relevantLogs.slice(0, 10).map(log => (
                              <div key={log.id} className="flex items-center justify-between gap-3 py-2" style={{ borderBottom: "1px solid rgba(18,38,32,0.05)" }}>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[0.75rem] font-medium truncate" style={{ color: "var(--deep-forest)" }}>{log.task_title || "No task"}</div>
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "rgba(18,38,32,0.35)" }}>
                                    {new Date(log.start_time).toLocaleDateString()} · {fmtTime(log.duration_minutes || 0)}
                                  </div>
                                </div>
                                <span className="shrink-0 text-[0.65rem] font-bold" style={{ color: "var(--deep-forest)" }}>{fmtTime(log.duration_minutes || 0)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </div>
              </motion.div>
            )}'''

if old_analytics_end in src:
    src = src.replace(old_analytics_end, new_analytics_extra)
    results.append("9. Analytics expanded ✓")
else:
    results.append("9. Analytics expansion: NOT FOUND ✗")

# ── 10. Fix topbar title for "clients" tab ─────────────────────────────────
old_title = '''               : activeTab === "knowledge_base" ? "Codex"
               : activeTab === "admin" ? "Admin"
               : ""}'''
new_title = '''               : activeTab === "clients" ? "Clients"
               : activeTab === "knowledge_base" ? "Knowledge Base"
               : activeTab === "admin" ? "Admin"
               : ""}'''
if old_title in src:
    src = src.replace(old_title, new_title)
    results.append("10. Topbar title fixed ✓")
else:
    results.append("10. Topbar title: NOT FOUND ✗")

with open("src/App.tsx", "w") as f:
    f.write(src)

print("\n".join(results))
print("\nDone.")
