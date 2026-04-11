#!/usr/bin/env python3
"""Full Jibble-like time tracker panel + notifications + auto clock-out."""

with open("src/App.tsx", "r") as f:
    src = f.read()

results = []

# ─── 1. Add "time" to ALL roles' tabs ──────────────────────────────────────
old_perms = '''"Admin":               { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","knowledge_base","admin"], canCreate: true,  canDelete: true,  canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
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
  "Solution Architect":  { tabs: ["dashboard","tasks","analytics","knowledge_base"],                                          canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },'''

new_perms = '''"Admin":               { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","time","knowledge_base","admin"], canCreate: true,  canDelete: true,  canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Eiden HQ":            { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","time","knowledge_base"],    canCreate: true,  canDelete: true,  canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Eiden Global":        { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","time","knowledge_base"],    canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Operational Manager": { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","time","knowledge_base"],    canCreate: true,  canDelete: true,  canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Brand Manager":       { tabs: ["dashboard","tasks","analytics","time","knowledge_base"],                                    canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Designer":            { tabs: ["dashboard","tasks","analytics","time","knowledge_base"],                                    canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Video Editor":        { tabs: ["dashboard","tasks","analytics","time","knowledge_base"],                                    canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Web Developer":       { tabs: ["dashboard","tasks","analytics","time","knowledge_base"],                                    canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Content Creator":     { tabs: ["dashboard","tasks","analytics","time","knowledge_base"],                                    canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Marketing Strategy":  { tabs: ["dashboard","tasks","analytics","time","knowledge_base"],                                    canCreate: false, canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Sales":               { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","time","knowledge_base"],    canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Commercial":          { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","time","knowledge_base"],    canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Solution Architect":  { tabs: ["dashboard","tasks","analytics","time","knowledge_base"],                                    canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },'''

if old_perms in src:
    src = src.replace(old_perms, new_perms)
    results.append("1. PERMISSIONS: 'time' tab added to all roles ✓")
else:
    results.append("1. PERMISSIONS: NOT FOUND ✗")

# ─── 2. Update activeTab type to include "time" ────────────────────────────
old_type = '''  const [activeTab, setActiveTab] = useState<"dashboard" | "pipeline" | "contacts" | "clients" | "tasks" | "analytics" | "knowledge_base" | "admin">("dashboard");'''
new_type = '''  const [activeTab, setActiveTab] = useState<"dashboard" | "pipeline" | "contacts" | "clients" | "tasks" | "analytics" | "time" | "knowledge_base" | "admin">("dashboard");'''
if old_type in src:
    src = src.replace(old_type, new_type)
    results.append("2. activeTab type updated ✓")
else:
    results.append("2. activeTab type: NOT FOUND ✗")

# ─── 3. Add work-schedule constants + notification/clock state after timer state ──
old_timer_state_end = '''  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Team chat'''
new_timer_state_end = '''  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live clock for time tracker
  const [liveTime, setLiveTime] = useState(new Date());

  // Notifications
  const [notifications, setNotifications] = useState<{ id: number; type: "task" | "clockout" | "warn"; title: string; body: string; at: number }[]>([]);
  const seenTaskIdsRef = useRef<Set<number>>(new Set());
  const autoClockWarnedRef = useRef(false);

  // Work schedule: { start, end } in 24h hours. null = weekend.
  const WORK_SCHEDULE: Record<number, { start: number; end: number } | null> = {
    0: null,                    // Sunday
    1: { start: 10, end: 17 }, // Monday
    2: { start: 10, end: 17 }, // Tuesday
    3: { start: 10, end: 17 }, // Wednesday
    4: { start: 10, end: 17 }, // Thursday
    5: { start: 15, end: 18 }, // Friday
    6: null,                    // Saturday
  };
  const getTodaySchedule = () => WORK_SCHEDULE[new Date().getDay()];

  // Team chat'''

if old_timer_state_end in src:
    src = src.replace(old_timer_state_end, new_timer_state_end)
    results.append("3. Schedule constants + notification state added ✓")
else:
    results.append("3. Schedule state: NOT FOUND ✗")

# ─── 4. Add liveTime + auto clock-out + task notification useEffects ──────
old_cleanup = '''  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, []);'''

new_cleanup = '''  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, []);

  // Live clock tick (every second)
  useEffect(() => {
    const tick = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Auto clock-out + end-of-shift warning
  useEffect(() => {
    if (!timerRunning) { autoClockWarnedRef.current = false; return; }
    const schedule = getTodaySchedule();
    if (!schedule) return;
    const now = liveTime;
    const totalMins = now.getHours() * 60 + now.getMinutes();
    const endMins = schedule.end * 60;
    // Warn 10 minutes before
    if (!autoClockWarnedRef.current && totalMins >= endMins - 10 && totalMins < endMins) {
      autoClockWarnedRef.current = true;
      setNotifications(prev => [...prev, {
        id: Date.now(), type: "warn",
        title: "⏰ Shift ending soon",
        body: `Your shift ends at ${schedule.end}:00. You will be clocked out automatically.`,
        at: Date.now()
      }]);
    }
    // Auto clock-out at end of shift
    if (totalMins >= endMins) {
      stopTimer();
      setNotifications(prev => [...prev, {
        id: Date.now(), type: "clockout",
        title: "✅ Auto Clock-Out",
        body: `You have been automatically clocked out at ${schedule.end}:00. Good work!`,
        at: Date.now()
      }]);
    }
  }, [liveTime, timerRunning]);

  // Task assignment notifications
  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;
    const myTasks = tasks.filter(t => t.assignee_id === currentUser.id);
    const newTasks = myTasks.filter(t => !seenTaskIdsRef.current.has(t.id));
    if (seenTaskIdsRef.current.size > 0 && newTasks.length > 0) {
      newTasks.forEach(t => {
        setNotifications(prev => [...prev, {
          id: Date.now() + t.id,
          type: "task",
          title: "📋 New Task Assigned",
          body: `"${t.title}" — due ${t.due_date} · Priority: ${t.priority}`,
          at: Date.now()
        }]);
      });
    }
    myTasks.forEach(t => seenTaskIdsRef.current.add(t.id));
  }, [tasks, isLoggedIn, currentUser]);'''

if old_cleanup in src:
    src = src.replace(old_cleanup, new_cleanup)
    results.append("4. Auto clock-out + task notification effects added ✓")
else:
    results.append("4. Effects: NOT FOUND ✗")

# ─── 5. Remove sidebar timer widget, replace with just a "Time Tracker" nav item ──
old_sidebar_widget = '''        {/* Time Tracker widget */}
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

        {/* Overdue notification in sidebar */}'''

new_sidebar_widget = '''        {/* Overdue notification in sidebar */}'''

if old_sidebar_widget in src:
    src = src.replace(old_sidebar_widget, new_sidebar_widget)
    results.append("5. Sidebar widget removed ✓")
else:
    results.append("5. Sidebar widget: NOT FOUND ✗")

# ─── 6. Add Time Tracker nav item in sidebar nav (after analytics) ─────────
old_nav = '''          {perms.tabs.includes("analytics") && <NavItem active={activeTab === "analytics"} onClick={() => { setActiveTab("analytics"); setSidebarOpen(false); }} icon={<BarChart2 size={14} />} label="Analytics" />}
          {perms.tabs.includes("clients") && <NavItem active={activeTab === "clients"} onClick={() => { setActiveTab("clients"); setSidebarOpen(false); }} icon={<Target size={14} />} label="Client Management" />}'''
new_nav = '''          {perms.tabs.includes("analytics") && <NavItem active={activeTab === "analytics"} onClick={() => { setActiveTab("analytics"); setSidebarOpen(false); }} icon={<BarChart2 size={14} />} label="Analytics" />}
          {perms.tabs.includes("clients") && <NavItem active={activeTab === "clients"} onClick={() => { setActiveTab("clients"); setSidebarOpen(false); }} icon={<Target size={14} />} label="Client Management" />}
          <NavItem active={activeTab === "time"} onClick={() => { setActiveTab("time"); setSidebarOpen(false); }} icon={<Clock size={14} />} label="Time Tracker" badge={timerRunning ? "●" : undefined} badgeColor="#4ade80" />'''

if old_nav in src:
    src = src.replace(old_nav, new_nav)
    results.append("6. Time Tracker nav item added ✓")
else:
    results.append("6. Nav item: NOT FOUND ✗")

# ─── 7. Update NavItem component to accept badgeColor prop ─────────────────
old_navitem = '''const NavItem = ({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number | string }) => ('''
new_navitem = '''const NavItem = ({ active, onClick, icon, label, badge, badgeColor }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number | string; badgeColor?: string }) => ('''
if old_navitem in src:
    src = src.replace(old_navitem, new_navitem)
    results.append("7a. NavItem prop updated ✓")
else:
    results.append("7a. NavItem: NOT FOUND ✗")

old_badge = '''      {badge !== undefined && (
        <span className="ml-auto text-[0.55rem] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--danger)", color: "white" }}>{badge}</span>
      )}'''
new_badge = '''      {badge !== undefined && (
        <span className="ml-auto text-[0.55rem] font-bold px-1.5 py-0.5 rounded-full" style={{ background: badgeColor || "var(--danger)", color: badgeColor ? "transparent" : "white", boxShadow: badgeColor ? `0 0 6px ${badgeColor}` : "none", fontSize: badgeColor ? "0.7rem" : undefined }}>{badge}</span>
      )}'''
if old_badge in src:
    src = src.replace(old_badge, new_badge)
    results.append("7b. NavItem badge color updated ✓")
else:
    results.append("7b. NavItem badge: NOT FOUND ✗")

# ─── 8. Update topbar title for "time" ─────────────────────────────────────
old_topbar = '''               : activeTab === "clients" ? "Clients"
               : activeTab === "knowledge_base" ? "Knowledge Base"
               : activeTab === "admin" ? "Admin"
               : ""}'''
new_topbar = '''               : activeTab === "clients" ? "Clients"
               : activeTab === "time" ? "Time Tracker"
               : activeTab === "knowledge_base" ? "Knowledge Base"
               : activeTab === "admin" ? "Admin"
               : ""}'''
if old_topbar in src:
    src = src.replace(old_topbar, new_topbar)
    results.append("8. Topbar title updated ✓")
else:
    results.append("8. Topbar: NOT FOUND ✗")

# ─── 9. Insert notification bell in topbar ──────────────────────────────────
old_topbar_btns = '''            {activeTab === "pipeline" && perms.canCreate && <button onClick={() => setShowNewDealModal(true)} className="btn-primary text-[0.68rem] px-3 py-1.5">+ Deal</button>}
            {activeTab === "contacts" && perms.canCreate && <button onClick={() => setShowNewContactModal(true)} className="btn-primary text-[0.68rem] px-3 py-1.5">+ Contact</button>}
            {activeTab === "tasks" && <button onClick={() => { setSelectedDealForTask(null); setShowNewTaskModal(true); }} className="btn-primary text-[0.68rem] px-3 py-1.5">+ Task</button>}
            {activeTab === "knowledge_base" && currentUser?.role === "Admin" && <button onClick={() => { setKbTitle(""); setKbContent(""); setKbCategory("Services"); setShowNewKnowledgeModal(true); }} className="btn-primary text-[0.68rem] px-3 py-1.5">+ Entry</button>}
            <button onClick={fetchData} style={{ color: "rgba(18,38,32,0.35)", background: "none", border: "none", cursor: "pointer", padding: 4 }} title="Refresh"
              onMouseEnter={e => (e.currentTarget.style.color = "var(--deep-forest)")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(18,38,32,0.35)")}>
              <RefreshCw size={14} />
            </button>'''
new_topbar_btns = '''            {activeTab === "pipeline" && perms.canCreate && <button onClick={() => setShowNewDealModal(true)} className="btn-primary text-[0.68rem] px-3 py-1.5">+ Deal</button>}
            {activeTab === "contacts" && perms.canCreate && <button onClick={() => setShowNewContactModal(true)} className="btn-primary text-[0.68rem] px-3 py-1.5">+ Contact</button>}
            {activeTab === "tasks" && <button onClick={() => { setSelectedDealForTask(null); setShowNewTaskModal(true); }} className="btn-primary text-[0.68rem] px-3 py-1.5">+ Task</button>}
            {activeTab === "knowledge_base" && currentUser?.role === "Admin" && <button onClick={() => { setKbTitle(""); setKbContent(""); setKbCategory("Services"); setShowNewKnowledgeModal(true); }} className="btn-primary text-[0.68rem] px-3 py-1.5">+ Entry</button>}
            {/* Notification bell */}
            <div className="relative">
              <button onClick={() => setNotifications([])} title={notifications.length > 0 ? "Click to dismiss all" : "No notifications"}
                style={{ color: notifications.length > 0 ? "var(--warning)" : "rgba(18,38,32,0.3)", background: "none", border: "none", cursor: "pointer", padding: 4, position: "relative" }}>
                <Bell size={15} />
                {notifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full text-[0.5rem] font-bold" style={{ background: "var(--danger)", color: "white" }}>{notifications.length}</span>
                )}
              </button>
            </div>
            <button onClick={fetchData} style={{ color: "rgba(18,38,32,0.35)", background: "none", border: "none", cursor: "pointer", padding: 4 }} title="Refresh"
              onMouseEnter={e => (e.currentTarget.style.color = "var(--deep-forest)")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(18,38,32,0.35)")}>
              <RefreshCw size={14} />
            </button>'''
if old_topbar_btns in src:
    src = src.replace(old_topbar_btns, new_topbar_btns)
    results.append("9. Notification bell added ✓")
else:
    results.append("9. Notification bell: NOT FOUND ✗")

# ─── 10. Add Bell to lucide imports ────────────────────────────────────────
old_import = '''import {
  Cpu, TrendingUp, Users, Bell, Settings,
  LogOut, Activity as ActivityIcon, CheckCircle2,
  AlertTriangle, Trash2, Edit3, ChevronRight, Send,
  MessageSquare, BarChart2, Bot, X, RefreshCw,
  Clock, Target, Zap, BookOpen, Shield
} from "lucide-react";'''
# Bell is already there, just need to ensure Clock is imported - it is.
# No change needed, skip.
results.append("10. Lucide imports already have Bell and Clock ✓")

# ─── 11. Insert full Time Tracker tab BEFORE Analytics tab ─────────────────
old_analytics_start = '''            {/* ── Analytics ────────────────────────────────────── */}
            {activeTab === "analytics" && ('''

new_time_tab = '''            {/* ── Time Tracker ─────────────────────────────────── */}
            {activeTab === "time" && (
              <motion.div key="time" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto">
                {(() => {
                  const schedule = getTodaySchedule();
                  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
                  const dayName = dayNames[liveTime.getDay()];
                  const isWeekend = schedule === null;
                  const nowMins = liveTime.getHours() * 60 + liveTime.getMinutes();
                  const shiftStartMins = schedule ? schedule.start * 60 : 0;
                  const shiftEndMins = schedule ? schedule.end * 60 : 0;
                  const isInShift = !isWeekend && nowMins >= shiftStartMins && nowMins < shiftEndMins;
                  const shiftTotalMins = schedule ? (schedule.end - schedule.start) * 60 : 0;
                  const shiftElapsedMins = isInShift ? nowMins - shiftStartMins : (nowMins >= shiftEndMins && !isWeekend ? shiftTotalMins : 0);
                  const shiftPct = shiftTotalMins > 0 ? Math.min(100, (shiftElapsedMins / shiftTotalMins) * 100) : 0;
                  const myTasks = filteredTasks.filter(t => t.assignee_id === currentUser?.id && t.status !== "Completed");
                  const todayStr = liveTime.toDateString();
                  const todayLogs = timeLogs.filter(l => l.user_id === currentUser?.id && l.end_time && new Date(l.start_time).toDateString() === todayStr);
                  const todayMins = todayLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0) + (timerRunning ? Math.floor(timerElapsed / 60) : 0);
                  const isManager = ["Admin","Eiden HQ","Operational Manager","Eiden Global"].includes(currentUser?.role || "");
                  const pad2 = (n: number) => String(n).padStart(2, "0");
                  const timeStr = `${pad2(liveTime.getHours())}:${pad2(liveTime.getMinutes())}:${pad2(liveTime.getSeconds())}`;
                  const dateStr = liveTime.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
                  const fmtMins = (m: number) => `${Math.floor(m/60)}h ${m%60}m`;
                  return (
                    <div className="space-y-5 pb-6">
                      {/* ── Header card: clock + clock-in ── */}
                      <div className="eiden-card overflow-hidden">
                        <div style={{ background: "var(--deep-forest)", padding: "32px 40px" }}>
                          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                            {/* Left: Clock */}
                            <div>
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "3.6rem", fontWeight: 700, color: "var(--silk-creme)", letterSpacing: "2px", lineHeight: 1 }}>
                                {timeStr}
                              </div>
                              <div className="mt-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", color: "rgba(244,235,208,0.4)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                                {dateStr}
                              </div>
                              {/* Status badge */}
                              <div className="mt-3 flex items-center gap-2">
                                {isWeekend ? (
                                  <span className="flex items-center gap-1.5 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider" style={{ background: "rgba(244,235,208,0.08)", color: "rgba(244,235,208,0.4)", border: "1px solid rgba(244,235,208,0.12)" }}>Weekend — No Shift</span>
                                ) : timerRunning ? (
                                  <>
                                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#4ade80" }} />
                                    <span className="px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>Working · {formatElapsed(timerElapsed)}</span>
                                  </>
                                ) : isInShift ? (
                                  <>
                                    <span className="w-2 h-2 rounded-full" style={{ background: "rgba(244,235,208,0.25)" }} />
                                    <span className="px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider" style={{ background: "rgba(244,235,208,0.06)", color: "rgba(244,235,208,0.5)", border: "1px solid rgba(244,235,208,0.12)" }}>Not Clocked In</span>
                                  </>
                                ) : (
                                  <span className="px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider" style={{ background: "rgba(244,235,208,0.04)", color: "rgba(244,235,208,0.3)", border: "1px solid rgba(244,235,208,0.08)" }}>
                                    {nowMins < shiftStartMins ? `Shift starts at ${schedule?.start}:00` : "Shift ended"}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Right: Clock-in panel */}
                            {!isWeekend && (
                              <div className="flex flex-col gap-3 lg:min-w-[260px]">
                                <select value={timerTaskId} onChange={e => setTimerTaskId(e.target.value === "" ? "" : Number(e.target.value))}
                                  disabled={timerRunning}
                                  className="outline-none px-3 py-2 text-[0.75rem]"
                                  style={{ background: "rgba(244,235,208,0.07)", border: "1px solid rgba(244,235,208,0.15)", color: timerRunning ? "rgba(244,235,208,0.35)" : "rgba(244,235,208,0.75)", fontFamily: "'Space Grotesk',sans-serif", cursor: timerRunning ? "default" : "pointer" }}>
                                  <option value="" style={{ background: "#122620" }}>— No specific task —</option>
                                  {myTasks.map(t => <option key={t.id} value={t.id} style={{ background: "#122620" }}>{t.title.slice(0,40)}</option>)}
                                </select>
                                {timerRunning ? (
                                  <button onClick={stopTimer}
                                    className="py-3 text-[0.82rem] font-bold uppercase tracking-wider transition-all"
                                    style={{ background: "rgba(139,58,58,0.4)", border: "2px solid rgba(220,100,100,0.5)", color: "rgba(255,180,180,0.9)", cursor: "pointer", letterSpacing: "2px" }}>
                                    ■ &nbsp; CLOCK OUT
                                  </button>
                                ) : (
                                  <button onClick={startTimer}
                                    className="py-3 text-[0.82rem] font-bold uppercase tracking-wider transition-all"
                                    style={{ background: "rgba(74,222,128,0.2)", border: "2px solid rgba(74,222,128,0.4)", color: "#4ade80", cursor: "pointer", letterSpacing: "2px" }}>
                                    ▶ &nbsp; CLOCK IN
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Shift progress bar */}
                        {!isWeekend && (
                          <div className="px-8 py-4" style={{ background: "rgba(18,38,32,0.03)", borderTop: "1px solid rgba(18,38,32,0.06)" }}>
                            <div className="flex items-center justify-between mb-2">
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.4)", textTransform: "uppercase", letterSpacing: "1.5px" }}>
                                Today's Shift — {schedule?.start}:00 → {schedule?.end}:00
                              </span>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.4)" }}>
                                {fmtMins(shiftElapsedMins)} / {fmtMins(shiftTotalMins)}
                              </span>
                            </div>
                            <div style={{ height: 6, background: "rgba(18,38,32,0.08)", borderRadius: 3, overflow: "hidden" }}>
                              <motion.div animate={{ width: `${shiftPct}%` }} transition={{ duration: 1, ease: "linear" }}
                                style={{ height: "100%", background: shiftPct >= 100 ? "var(--success)" : "var(--deep-forest)", borderRadius: 3 }} />
                            </div>
                            <div className="flex justify-between mt-1">
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(18,38,32,0.3)" }}>{schedule?.start}:00</span>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(18,38,32,0.3)" }}>{schedule?.end}:00</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ── Stats row ── */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: "Today", value: fmtMins(todayMins), accent: timerRunning },
                          { label: "This Week", value: fmtMins(timeLogs.filter(l => l.user_id === currentUser?.id && l.end_time && new Date(l.start_time) >= (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d; })()).reduce((s, l) => s + (l.duration_minutes||0), 0)), accent: false },
                          { label: "Entries Today", value: String(todayLogs.length + (timerRunning ? 1 : 0)), accent: false },
                          { label: "Status", value: timerRunning ? "Working" : isWeekend ? "Weekend" : isInShift ? "Available" : "Off Shift", accent: timerRunning },
                        ].map(s => (
                          <div key={s.label} className="eiden-card p-4">
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.4)", marginBottom: 6 }}>{s.label}</div>
                            <div style={{ fontSize: "1.3rem", fontWeight: 300, color: s.accent ? "var(--success)" : "var(--deep-forest)", lineHeight: 1 }}>{s.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* ── Today's entries ── */}
                        <div className="eiden-card overflow-hidden">
                          <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(18,38,32,0.07)", background: "rgba(18,38,32,0.02)" }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Today's Entries</span>
                          </div>
                          {timerRunning && (
                            <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid rgba(18,38,32,0.05)", background: "rgba(74,222,128,0.04)" }}>
                              <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: "#4ade80" }} />
                              <div className="flex-1 min-w-0">
                                <div className="text-[0.78rem] font-semibold" style={{ color: "var(--deep-forest)" }}>
                                  {filteredTasks.find(t => t.id === Number(timerTaskId))?.title || "No specific task"}
                                </div>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.4)", marginTop: 2 }}>
                                  Started {timerStart ? `${pad2(timerStart.getHours())}:${pad2(timerStart.getMinutes())}` : "—"} · In progress
                                </div>
                              </div>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", fontWeight: 700, color: "#4ade80" }}>{formatElapsed(timerElapsed)}</span>
                            </div>
                          )}
                          {todayLogs.length === 0 && !timerRunning ? (
                            <div className="px-5 py-8 text-center">
                              <Clock size={28} className="mx-auto mb-3 opacity-15" style={{ color: "var(--deep-forest)" }} />
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "rgba(18,38,32,0.3)" }}>No time logged today</div>
                            </div>
                          ) : (
                            <div className="divide-y" style={{ borderColor: "rgba(18,38,32,0.05)" }}>
                              {[...todayLogs].reverse().map(log => (
                                <div key={log.id} className="flex items-center gap-3 px-5 py-3">
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--deep-forest)", opacity: 0.25 }} />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[0.78rem] font-medium truncate" style={{ color: "var(--deep-forest)" }}>{log.task_title || "No specific task"}</div>
                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "rgba(18,38,32,0.35)", marginTop: 1 }}>
                                      {new Date(log.start_time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} → {log.end_time ? new Date(log.end_time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : "—"}
                                    </div>
                                  </div>
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", fontWeight: 600, color: "var(--deep-forest)", flexShrink: 0 }}>{fmtMins(log.duration_minutes||0)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* ── Schedule info / recent history ── */}
                        <div className="eiden-card overflow-hidden">
                          <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(18,38,32,0.07)", background: "rgba(18,38,32,0.02)" }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Weekly Schedule</span>
                          </div>
                          <div className="divide-y" style={{ borderColor: "rgba(18,38,32,0.05)" }}>
                            {[1,2,3,4,5,6,0].map(d => {
                              const sch = WORK_SCHEDULE[d];
                              const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
                              const isToday = liveTime.getDay() === d;
                              return (
                                <div key={d} className="flex items-center gap-4 px-5 py-2.5">
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: isToday ? 700 : 400, color: isToday ? "var(--deep-forest)" : "rgba(18,38,32,0.4)", width: 32 }}>{names[d]}</span>
                                  {sch ? (
                                    <>
                                      <div style={{ flex: 1, height: 4, background: "rgba(18,38,32,0.06)", borderRadius: 2, overflow: "hidden" }}>
                                        <div style={{ height: "100%", marginLeft: `${((sch.start-8)/14)*100}%`, width: `${((sch.end-sch.start)/14)*100}%`, background: isToday ? "var(--deep-forest)" : "rgba(18,38,32,0.2)", borderRadius: 2 }} />
                                      </div>
                                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: isToday ? "var(--deep-forest)" : "rgba(18,38,32,0.4)", width: 80, textAlign: "right" }}>{sch.start}:00 – {sch.end}:00</span>
                                    </>
                                  ) : (
                                    <>
                                      <div style={{ flex: 1 }} />
                                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.2)" }}>Weekend</span>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* ── Manager: Team overview ── */}
                      {isManager && (
                        <div className="eiden-card overflow-hidden">
                          <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(18,38,32,0.07)", background: "rgba(18,38,32,0.02)" }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Team Time Overview</span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.3)" }}>{liveTime.toLocaleDateString()}</span>
                          </div>
                          <div className="divide-y" style={{ borderColor: "rgba(18,38,32,0.05)" }}>
                            {users.filter(u => u.workspace_id === currentWorkspace?.id).map(u => {
                              const uTodayLogs = timeLogs.filter(l => l.user_id === u.id && l.end_time && new Date(l.start_time).toDateString() === todayStr);
                              const uTodayMins = uTodayLogs.reduce((s, l) => s + (l.duration_minutes||0), 0);
                              const uWeekLogs = timeLogs.filter(l => l.user_id === u.id && l.end_time && new Date(l.start_time) >= (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d; })());
                              const uWeekMins = uWeekLogs.reduce((s, l) => s + (l.duration_minutes||0), 0);
                              const isClockedIn = u.id === currentUser?.id && timerRunning;
                              return (
                                <div key={u.id} className="flex items-center gap-4 px-5 py-3">
                                  <div className="flex items-center gap-2.5 w-40 shrink-0">
                                    <div className="w-7 h-7 flex items-center justify-center text-[0.65rem] font-bold shrink-0" style={{ background: "var(--deep-forest)", color: "var(--silk-creme)" }}>{u.name[0]}</div>
                                    <div>
                                      <div className="text-[0.78rem] font-semibold" style={{ color: "var(--deep-forest)" }}>{u.name.split(" ")[0]}</div>
                                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(18,38,32,0.35)" }}>{u.role}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${isClockedIn ? "animate-pulse" : ""}`} style={{ background: isClockedIn ? "#4ade80" : "rgba(18,38,32,0.15)" }} />
                                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: isClockedIn ? "var(--success)" : "rgba(18,38,32,0.3)" }}>{isClockedIn ? "Working" : "—"}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div style={{ height: 4, background: "rgba(18,38,32,0.06)", borderRadius: 2, overflow: "hidden" }}>
                                      <div style={{ height: "100%", width: `${Math.min(100, (uTodayMins/(7*60))*100)}%`, background: uTodayMins > 0 ? "var(--deep-forest)" : "transparent", borderRadius: 2 }} />
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0" style={{ width: 100 }}>
                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 600, color: "var(--deep-forest)" }}>{fmtMins(uTodayMins)}</div>
                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(18,38,32,0.3)" }}>wk: {fmtMins(uWeekMins)}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {/* ── Analytics ────────────────────────────────────── */}
            {activeTab === "analytics" && ('''

if old_analytics_start in src:
    src = src.replace(old_analytics_start, new_time_tab)
    results.append("11. Full Time Tracker tab inserted ✓")
else:
    results.append("11. Time Tracker tab: NOT FOUND ✗")

# ─── 12. Add notification toast overlay (before closing </AnimatePresence>) ─
old_chat_toast = '''      {/* Chat notification toast */}
      <AnimatePresence>
        {chatToast && ('''

new_notif_toast = '''      {/* Notification toasts */}
      <AnimatePresence>
        {notifications.slice(-1).map(n => (
          <motion.div key={n.id}
            initial={{ opacity: 0, y: 60, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 60, x: "-50%" }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))}
            className="fixed bottom-6 left-1/2 cursor-pointer z-[9999] flex items-center gap-3 px-5 py-4"
            style={{
              background: n.type === "clockout" ? "var(--success)" : n.type === "warn" ? "#92600a" : "var(--deep-forest)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)", minWidth: 300, maxWidth: 400
            }}>
            <div className="shrink-0 w-8 h-8 flex items-center justify-center text-[1rem]" style={{ background: "rgba(255,255,255,0.12)" }}>
              {n.type === "clockout" ? "✅" : n.type === "warn" ? "⏰" : "📋"}
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "1px" }}>{n.title}</div>
              <div className="text-[0.78rem] mt-0.5" style={{ color: "rgba(255,255,255,0.9)", fontWeight: 500, lineHeight: 1.3 }}>{n.body}</div>
            </div>
            <X size={14} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Chat notification toast */}
      <AnimatePresence>
        {chatToast && ('''

if old_chat_toast in src:
    src = src.replace(old_chat_toast, new_notif_toast)
    results.append("12. Notification toast overlay added ✓")
else:
    results.append("12. Notification toast: NOT FOUND ✗")

with open("src/App.tsx", "w") as f:
    f.write(src)

print("\n".join(results))
print("\nDone.")
