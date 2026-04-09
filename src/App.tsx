/**
 * Eiden AI BSM — powered by Claude (Anthropic)
 * @license Apache-2.0
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Cpu, TrendingUp, Users, Bell, Settings,
  LogOut, Activity as ActivityIcon, CheckCircle2,
  AlertTriangle, Trash2, Edit3, ChevronRight, Send,
  MessageSquare, BarChart2, Bot, X, RefreshCw,
  Clock, Target, Zap, BookOpen, Shield, Search
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "./lib/supabase";
import { useAiChatStore } from "./stores/aiChatStore";
import type { AiMessage } from "./stores/aiChatStore";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Stats {
  pipelineValue: number;
  activeDeals: number;
  winRate: string;
  activeClients: number;
  overdueTasks: number;
}
interface Deal {
  id: number; title: string; value: number; stage: string;
  contact_name: string; risk_score: number; win_probability: number;
  notes?: string; workspace_id: number; contact_id: number;
}
interface Activity {
  id: number; user_name?: string; action: string;
  related_to?: string; type: string; time: string;
}
interface Task {
  id: number; title: string; description?: string;
  assignee_name: string; assignee_id: number; deal_title?: string;
  related_deal_id?: number; client_id?: number; client_name?: string;
  due_date: string; status: string;
  priority: string; workspace_id: number; created_at?: string;
  overdue_reason?: string; overdue_reason_at?: string;
}
interface Client {
  id: number; name: string; industry: string; status: string;
  onboarding_stage: string; contact_person: string; contact_email: string;
  contact_phone: string; monthly_value: number; notes?: string;
  workspace_id: number; created_at?: string;
}
interface User {
  id: number; name: string; role: string; workspace_id: number;
}
interface Contact {
  id: number; name: string; company: string; email: string;
  phone: string; status: string; source: string; ltv: number;
  notes?: string; workspace_id: number;
}
interface KnowledgeItem {
  id: number; title: string; content: string; category: string;
}
interface TimeLog {
  id: number; user_id: number; user_name: string;
  task_id?: number; task_title?: string;
  start_time: string; end_time?: string;
  duration_minutes: number; notes?: string;
  workspace_id: number; created_at?: string;
}
interface Workspace { id: number; name: string; }
interface ChatMessage { id: number; user: string; text: string; created_at: string; }
interface ZoomMeeting { id: number; topic: string; start_time: string; duration: number; join_url: string; }

// ─── Permissions ──────────────────────────────────────────────────────────────
// canAssignAll  → can assign tasks to any user (not just themselves)
// ownTasksOnly  → only see tasks assigned to them
const PERMISSIONS: Record<string, { tabs: string[]; canCreate: boolean; canDelete: boolean; canViewAnalytics: boolean; canAssignAll: boolean; ownTasksOnly: boolean }> = {
  "Admin":                        { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","time","knowledge_base","team","admin"], canCreate: true,  canDelete: true,  canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Eiden HQ":                     { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","time","knowledge_base","team"],   canCreate: true,  canDelete: true,  canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Eiden Global":                  { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","time","knowledge_base","team"],   canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Operational Manager":           { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","time","knowledge_base","team"],   canCreate: true,  canDelete: true,  canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Admin Coordinator":             { tabs: ["dashboard","tasks","analytics","time","knowledge_base","team"],                                  canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Brand Manager":                 { tabs: ["dashboard","tasks","analytics","time","knowledge_base","team"],                                  canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Branding and Strategy Manager": { tabs: ["dashboard","tasks","analytics","time","knowledge_base","team"],                                  canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Solution Architect":            { tabs: ["dashboard","tasks","analytics","time","knowledge_base","team"],                                  canCreate: true,  canDelete: false, canViewAnalytics: true,  canAssignAll: true,  ownTasksOnly: false },
  "Designer":                      { tabs: ["dashboard","tasks","time","knowledge_base","team"],                                             canCreate: false, canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Video Editor":                  { tabs: ["dashboard","tasks","time","knowledge_base","team"],                                             canCreate: false, canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Web Developer":                 { tabs: ["dashboard","tasks","time","knowledge_base","team"],                                             canCreate: false, canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Community Manager":             { tabs: ["dashboard","tasks","time","knowledge_base","team"],                                             canCreate: false, canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Content Creator":               { tabs: ["dashboard","tasks","time","knowledge_base","team"],                                             canCreate: false, canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Content Strategy":              { tabs: ["dashboard","tasks","time","knowledge_base","team"],                                             canCreate: false, canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Marketing Strategy":            { tabs: ["dashboard","tasks","time","knowledge_base","team"],                                             canCreate: false, canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "DevOps":                        { tabs: ["dashboard","tasks","time","knowledge_base","team"],                                             canCreate: false, canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Intern":                        { tabs: ["dashboard","tasks","time","knowledge_base","team"],                                             canCreate: false, canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true  },
  "Sales":                         { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","time","knowledge_base","team"],  canCreate: false, canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
  "Commercial":                    { tabs: ["dashboard","pipeline","contacts","clients","tasks","analytics","time","knowledge_base","team"],  canCreate: false, canDelete: false, canViewAnalytics: true,  canAssignAll: false, ownTasksOnly: true  },
};
const getPerms = (role?: string | null) => PERMISSIONS[role ?? ""] ?? { tabs: ["dashboard","tasks","knowledge_base"], canCreate: false, canDelete: false, canViewAnalytics: false, canAssignAll: false, ownTasksOnly: true };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const isOverdue = (dueDate: string, status: string) => {
  if (status === "Completed") return false;
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
};

const formatDueDate = (dueDate: string) => {
  if (!dueDate) return "—";
  const d = new Date(dueDate);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} · ${time}`;
};

const toDatetimeLocal = (isoString: string) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const priorityColor = (p: string) =>
  p === "High" ? "text-[var(--danger)] border-[var(--danger)]"
  : p === "Medium" ? "text-[var(--warning)] border-[var(--warning)]"
  : "text-[var(--gris)] border-[var(--border)]";

const stageColor = (s: string) =>
  s === "Won" ? "text-[var(--success)]"
  : s === "Lost" ? "text-[var(--danger)]"
  : s === "Negotiation" ? "text-[var(--warning)]"
  : "text-[var(--deep-forest)]";

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const savedSession = (() => { try { const s = localStorage.getItem("eiden_session"); return s ? JSON.parse(s) : null; } catch { return null; } })();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(!!savedSession);
  const [currentUser, setCurrentUser] = useState<User | null>(savedSession?.user ?? null);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(savedSession?.workspace ?? null);
  const [view, setView] = useState<"login" | "register" | "recovery">("login");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "pipeline" | "contacts" | "clients" | "tasks" | "analytics" | "time" | "knowledge_base" | "admin" | "team">("dashboard");
  const [showTfa, setShowTfa] = useState(false);
  const [tfaProgress, setTfaProgress] = useState(0);

  // Data
  const [stats, setStats] = useState<Stats | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [financials, setFinancials] = useState<{ totalRevenue: number; pendingRevenue: number; monthly: any[] } | null>(null);

  // Modals
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [showNewDealModal, setShowNewDealModal] = useState(false);
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const [selectedKnowledge, setSelectedKnowledge] = useState<KnowledgeItem | null>(null);
  const [showNewKnowledgeModal, setShowNewKnowledgeModal] = useState(false);
  const [showEditKnowledgeModal, setShowEditKnowledgeModal] = useState(false);
  const [editKnowledge, setEditKnowledge] = useState<KnowledgeItem | null>(null);
  const [kbTitle, setKbTitle] = useState("");
  const [kbContent, setKbContent] = useState("");
  const [kbCategory, setKbCategory] = useState("Services");
  const [showDealEditModal, setShowDealEditModal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [selectedDealForTask, setSelectedDealForTask] = useState<Deal | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Edit task
  const [editTask, setEditTask] = useState<Task | null>(null);

  // Clients
  const [clients, setClients] = useState<Client[]>([]);
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [showEditClientModal, setShowEditClientModal] = useState(false);

  // Overdue reason
  const [overdueTask, setOverdueTask] = useState<Task | null>(null);
  const [overdueReasonText, setOverdueReasonText] = useState("");
  const [overdueReasonSaving, setOverdueReasonSaving] = useState(false);

  // Task detail modal
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<Task | null>(null);

  // Employee task analytics modal
  const [selectedEmployeeAnalytics, setSelectedEmployeeAnalytics] = useState<User | null>(null);

  // Analytics sub-tab
  const [analyticsSection, setAnalyticsSection] = useState<"tasks" | "pipeline" | "deals" | "contacts">("tasks");

  // Deadline edit modal (Admin Coordinator)
  const [deadlineEditTask, setDeadlineEditTask] = useState<Task | null>(null);
  const [deadlineEditValue, setDeadlineEditValue] = useState("");

  // Time tracker
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState<Date | null>(null);
  const [timerElapsed, setTimerElapsed] = useState(0); // seconds
  const [timerTaskId, setTimerTaskId] = useState<number | "">("");
  const [timerLogId, setTimerLogId] = useState<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Team chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatUnread, setChatUnread] = useState(0);
  const [chatToast, setChatToast] = useState<{ user: string; text: string } | null>(null);
  const chatToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [meetingLink, setMeetingLink] = useState("");
  const [isMeetingSaving, setIsMeetingSaving] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Zoom
  const [zoomConnected, setZoomConnected] = useState(false);
  const [zoomEmail, setZoomEmail] = useState("");
  const [zoomMeetings, setZoomMeetings] = useState<ZoomMeeting[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [zoomTopic, setZoomTopic] = useState("");
  const [zoomDate, setZoomDate] = useState("");
  const [zoomTime, setZoomTime] = useState("09:00");
  const [zoomDuration, setZoomDuration] = useState("60");
  const [isScheduling, setIsScheduling] = useState(false);

  // Admin panel
  const [adminData, setAdminData] = useState<{ workspaces: any[]; users: any[] } | null>(null);
  const [adminSection, setAdminSection] = useState<"workspaces" | "users" | "ai">("workspaces");
  const [pendingUserRoles, setPendingUserRoles] = useState<Record<number, string>>({});
  const [aiProviderData, setAiProviderData] = useState<{ active: string; providers: any[] } | null>(null);
  const [showCreateWsModal, setShowCreateWsModal] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [isCreatingWs, setIsCreatingWs] = useState(false);

  // AI Assistant — persistent via Zustand + localStorage
  const { getMessages, addMessage, clearHistory } = useAiChatStore();
  const aiMessages = currentWorkspace ? getMessages(currentWorkspace.id) : [];
  const [aiInput, setAiInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [pendingAiAction, setPendingAiAction] = useState<{ action: string; data: any; summary: string } | null>(null);
  const [taskSearch, setTaskSearch] = useState("");
  const aiEndRef = useRef<HTMLDivElement>(null);

  // Auth forms
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState("");
  const [regStep, setRegStep] = useState(0);
  const [isRegistering, setIsRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [showRecoveryDone, setShowRecoveryDone] = useState(false);

  // ─── Filtered data by workspace ─────────────────────────────────────────────
  const perms = getPerms(currentUser?.role);
  const filteredDeals = deals.filter(d => d.workspace_id === currentWorkspace?.id);
  const filteredContacts = contacts.filter(c => c.workspace_id === currentWorkspace?.id);
  const filteredTasks = tasks.filter(t =>
    t.workspace_id === currentWorkspace?.id &&
    (!perms.ownTasksOnly || t.assignee_id === currentUser?.id) &&
    (!taskSearch || t.title.toLowerCase().includes(taskSearch.toLowerCase()) || (t.assignee_name || "").toLowerCase().includes(taskSearch.toLowerCase()) || (t.client_name || "").toLowerCase().includes(taskSearch.toLowerCase()))
  );

  // ─── Fetch all data ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [statsRes, dealsRes, tasksRes, contactsRes, usersRes, workspacesRes, knowledgeRes, activityRes, financialsRes, clientsRes, timeLogsRes] = await Promise.all([
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
      if (timeLogsRes.ok) setTimeLogs(await timeLogsRes.json());
    } catch (err) { console.error("Fetch error:", err); }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isLoggedIn, fetchData]);

  // Cleanup timer on unmount
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
          body: `"${t.title}" — due ${formatDueDate(t.due_date)} · Priority: ${t.priority}`,
          at: Date.now()
        }]);
      });
    }
    myTasks.forEach(t => seenTaskIdsRef.current.add(t.id));
  }, [tasks, isLoggedIn, currentUser]);

  useEffect(() => {
    if (!isLoggedIn || !currentWorkspace?.id) return;
    fetch(`/api/workspace-settings/${currentWorkspace.id}`)
      .then(r => r.json())
      .then(d => { if (d.meeting_link) setMeetingLink(d.meeting_link); })
      .catch(() => {});
  }, [isLoggedIn, currentWorkspace?.id]);


  // Handle ?zoom=connected or ?zoom=error after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zoom = params.get("zoom");
    if (zoom) {
      window.history.replaceState({}, "", window.location.pathname);
      if (zoom === "connected") {
      }
    }
  }, []);


  // Team chat — background realtime subscription (always on when logged in)
  useEffect(() => {
    if (!isLoggedIn || !currentWorkspace?.id) return;
    const channel = supabase
      .channel(`chat:${currentWorkspace.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `workspace_id=eq.${currentWorkspace.id}` },
        (payload) => {
          const row = payload.new as any;
          const msg = { id: row.id, user: row.user_name, text: row.message, created_at: row.created_at };
          setChatMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev.filter(m => !(m.user === row.user_name && m.text === row.message && typeof m.id === "number" && m.id > 1e12)), msg]);
          // Only notify if message is from someone else and not on chat tab
          setActiveTab(tab => {
            if (tab !== "communications" && row.user_name !== currentUser?.name) {
              setChatUnread(n => n + 1);
              setChatToast({ user: row.user_name, text: row.message });
              if (chatToastTimer.current) clearTimeout(chatToastTimer.current);
              chatToastTimer.current = setTimeout(() => setChatToast(null), 4000);
            }
            return tab;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isLoggedIn, currentWorkspace?.id, currentUser?.name]);

  // Scroll AI chat to bottom
  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, isAiThinking]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!isLoggedIn || activeTab !== "admin" || currentUser?.role !== "Admin") return;
    fetchAdminData();
  }, [isLoggedIn, activeTab, currentUser?.role]);

  // ─── AI Assistant ────────────────────────────────────────────────────────────
  const sendAiMessage = useCallback(async (text: string = aiInput) => {
    const trimmed = text.trim();
    if (!trimmed || isAiThinking || !currentWorkspace) return;

    const wsId = currentWorkspace.id;
    const userMsg: Omit<AiMessage, "timestamp"> = { role: "user", content: trimmed };
    addMessage(wsId, userMsg);
    setAiInput("");
    setIsAiThinking(true);

    // Build history to send (include the new user message)
    const history = [...getMessages(wsId), { ...userMsg, timestamp: Date.now() }];

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) })
      });
      const data = await res.json();

      if (!res.ok) {
        addMessage(wsId, { role: "assistant", content: `Error: ${data.error || "AI unavailable"}` });
        return;
      }

      const responseText: string = data.text || "No response.";
      addMessage(wsId, { role: "assistant", content: responseText });

      // Parse AI action — only PROPOSE, never auto-execute
      try {
        const start = responseText.indexOf('"action"');
        if (start !== -1) {
          let objStart = responseText.lastIndexOf("{", start);
          if (objStart !== -1) {
            let depth = 0, end = objStart;
            for (let i = objStart; i < responseText.length; i++) {
              if (responseText[i] === "{") depth++;
              else if (responseText[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
            }
            let parsed: any = null;
            try { parsed = JSON.parse(responseText.slice(objStart, end + 1)); } catch { parsed = null; }
            if (parsed?.action && parsed?.data) {
              const act = parsed.action;
              const d = parsed.data;
              // Build a human-readable summary for the confirmation prompt
              const summaries: Record<string, string> = {
                create_task: `Create task "${d.title}" → ${d.assignee || "me"} · ${d.priority || "Medium"} · due ${d.due_date || "in 7 days"}`,
                update_task: `Update task #${d.id}${d.status ? ` → ${d.status}` : ""}${d.priority ? ` · ${d.priority}` : ""}${d.due_date ? ` · due ${d.due_date}` : ""}`,
                delete_task: `Delete task #${d.id} permanently`,
                create_deal: `Create deal "${d.title}" · $${d.value || 0} · ${d.stage || "Lead"}`,
                update_deal: `Update deal #${d.id}${d.stage ? ` → ${d.stage}` : ""}${d.value !== undefined ? ` · $${d.value}` : ""}`,
                delete_deal: `Delete deal #${d.id} permanently`,
                create_contact: `Create contact "${d.name}"${d.company ? ` (${d.company})` : ""}`,
                update_contact: `Update contact #${d.id}${d.status ? ` → ${d.status}` : ""}`,
                delete_contact: `Delete contact #${d.id} permanently`,
              };
              const summary = summaries[act] || `${act} — confirm to proceed`;
              setPendingAiAction({ action: act, data: d, summary });
            }
          }
        }
      } catch (e: any) {
        console.error("AI action parse error:", e);
      }
    } catch {
      addMessage(wsId, { role: "assistant", content: "Connection error. Please check your network and try again." });
    } finally {
      setIsAiThinking(false);
    }
  }, [aiInput, isAiThinking, getMessages, addMessage, users, currentUser, currentWorkspace, fetchData]);

  // ─── Execute confirmed AI action ────────────────────────────────────────────
  const executeAiAction = async (act: string, d: any) => {
    if (!currentWorkspace) return;
    const wsId = currentWorkspace.id;
    const post = (url: string, body: any) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const patch = (url: string, body: any) => fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const del = (url: string) => fetch(url, { method: "DELETE" });

    let r: Response;
    if (act === "create_task") {
      const assignee = users.find(u => u.name.toLowerCase().includes((d.assignee || "").toLowerCase()));
      r = await post("/api/tasks", { title: d.title, description: d.description || "", assignee_id: assignee?.id || currentUser?.id, due_date: d.due_date || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0], priority: d.priority || "Medium", workspace_id: wsId });
      addMessage(wsId, { role: "assistant", content: r.ok ? `✅ Task "${d.title}" created!` : `❌ Failed to create task.` });
    } else if (act === "update_task" && d.id) {
      const updates: any = {};
      if (d.status) updates.status = d.status;
      if (d.priority) updates.priority = d.priority;
      if (d.due_date) updates.due_date = d.due_date;
      if (d.assignee) { const u = users.find(u => u.name.toLowerCase().includes(d.assignee.toLowerCase())); if (u) updates.assignee_id = u.id; }
      r = await patch(`/api/tasks/${d.id}`, updates);
      addMessage(wsId, { role: "assistant", content: r.ok ? `✅ Task #${d.id} updated!` : `❌ Failed to update task.` });
    } else if (act === "delete_task" && d.id) {
      r = await del(`/api/tasks/${d.id}`);
      addMessage(wsId, { role: "assistant", content: r.ok ? `✅ Task #${d.id} deleted.` : `❌ Failed to delete task.` });
    } else if (act === "create_deal") {
      r = await post("/api/deals", { title: d.title, value: d.value || 0, stage: d.stage || "Lead", workspace_id: wsId });
      addMessage(wsId, { role: "assistant", content: r.ok ? `✅ Deal "${d.title}" created!` : `❌ Failed to create deal.` });
    } else if (act === "update_deal" && d.id) {
      const updates: any = {};
      if (d.stage) updates.stage = d.stage;
      if (d.value !== undefined) updates.value = d.value;
      if (d.notes) updates.notes = d.notes;
      r = await patch(`/api/deals/${d.id}`, updates);
      addMessage(wsId, { role: "assistant", content: r.ok ? `✅ Deal #${d.id} updated!` : `❌ Failed to update deal.` });
    } else if (act === "delete_deal" && d.id) {
      r = await del(`/api/deals/${d.id}`);
      addMessage(wsId, { role: "assistant", content: r.ok ? `✅ Deal #${d.id} deleted.` : `❌ Failed to delete deal.` });
    } else if (act === "create_contact") {
      r = await post("/api/contacts", { name: d.name, company: d.company || "", email: d.email || "", status: d.status || "Prospect", source: d.source || "", workspace_id: wsId });
      addMessage(wsId, { role: "assistant", content: r.ok ? `✅ Contact "${d.name}" created!` : `❌ Failed to create contact.` });
    } else if (act === "update_contact" && d.id) {
      const updates: any = {};
      if (d.status) updates.status = d.status;
      if (d.company) updates.company = d.company;
      if (d.email) updates.email = d.email;
      if (d.notes) updates.notes = d.notes;
      r = await patch(`/api/contacts/${d.id}`, updates);
      addMessage(wsId, { role: "assistant", content: r.ok ? `✅ Contact #${d.id} updated!` : `❌ Failed to update contact.` });
    } else if (act === "delete_contact" && d.id) {
      r = await del(`/api/contacts/${d.id}`);
      addMessage(wsId, { role: "assistant", content: r.ok ? `✅ Contact #${d.id} deleted.` : `❌ Failed to delete contact.` });
    } else { return; }
    await fetchData();
  };

  // ─── Auth ────────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setLoginError(null);
    if (!loginUser.trim() || !loginPass) {
      setLoginError("Please enter your username and password");
      return;
    }
    try {
      const res = await fetch("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser.trim(), password: loginPass })
      });
      if (!res.ok) {
        const err = await res.json();
        setLoginError(err.error || "Invalid credentials");
        return;
      }
      const user = await res.json();
      setShowTfa(true);
      let progress = 0;
      const interval = setInterval(() => {
        progress += 4;
        setTfaProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(async () => {
            const wsRes = await fetch("/api/workspaces");
            const allWs: Workspace[] = await wsRes.json();
            const ws = allWs.find(w => w.id === user.workspace_id) || allWs[0];
            setCurrentUser(user);
            setCurrentWorkspace(ws);
            setIsLoggedIn(true);
            setShowTfa(false);
            localStorage.setItem("eiden_session", JSON.stringify({ user, workspace: ws }));
            // Welcome message — only add if this workspace has no history yet
            if (useAiChatStore.getState().getMessages(ws.id).length === 0) {
              useAiChatStore.getState().addMessage(ws.id, {
                role: "assistant",
                content: `Welcome back, ${user.name}! I'm EIDEN AI, your BSM assistant. I can help you manage tasks, analyze your pipeline, and keep your team on track.\n\nTry asking me:\n• "What tasks are overdue?"\n• "Give me a morning briefing"\n• "What deals are at risk?"\n• "Create a task to review the proposal for Sarah"`
              });
            }
          }, 400);
        }
      }, 40);
    } catch {
      setLoginError("Connection failed. Please try again.");
    }
  };

  const handleRegister = async () => {
    setRegError(null);
    if (!regName || !regEmail || !regUsername || !regPassword || !regRole) {
      setRegError("All fields are required");
      return;
    }
    if (!regEmail.toLowerCase().endsWith("@eiden-group.com")) { setRegError("Email must be a valid @eiden-group.com address"); return; }
    if (regPassword.length < 6) { setRegError("Password must be at least 6 characters"); return; }
    setIsRegistering(true);
    try {
      const res = await fetch("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: regName, email: regEmail, username: regUsername, password: regPassword, role: regRole, pending: true })
      });
      if (res.ok) {
        setRegStep(2);
      } else {
        const err = await res.json();
        setRegError(err.error || "Registration failed");
      }
    } catch { setRegError("Connection failed"); }
    finally { setIsRegistering(false); }
  };

  // ─── Task Actions ────────────────────────────────────────────────────────────
  const updateTaskStatus = async (id: number, status: string) => {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    fetchData();
  };

  // Employee drags own task — updates status and notifies team chat (visible to Aya and all managers)
  const updateTaskStatusByEmployee = async (id: number, status: string, taskTitle: string) => {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (currentUser && currentWorkspace) {
      const msg = `📋 ${currentUser.name} moved "${taskTitle}" → ${status}`;
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: currentWorkspace.id, user_id: currentUser.id, user_name: currentUser.name, text: msg })
      });
      setChatMessages(prev => [...prev, { id: Date.now(), user: currentUser.name, text: msg, created_at: new Date().toISOString() }]);
      setNotifications(prev => [...prev, { id: Date.now(), type: "task" as const, title: "Task Moved", body: msg, at: Date.now() }]);
    }
    fetchData();
  };

  const deleteTask = async (id: number) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    fetchData();
  };

  const saveDeadlineEdit = async () => {
    if (!deadlineEditTask || !deadlineEditValue) return;
    await fetch(`/api/tasks/${deadlineEditTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ due_date: deadlineEditValue ? new Date(deadlineEditValue).toISOString() : deadlineEditValue })
    });
    setDeadlineEditTask(null);
    fetchData();
  };

  const handleCreateTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fd.get("title"),
        description: fd.get("description"),
        assignee_id: parseInt(fd.get("assignee_id") as string),
        due_date: fd.get("due_date") ? new Date(fd.get("due_date") as string).toISOString() : null,
        priority: fd.get("priority"),
        client_id: fd.get("client_id") ? parseInt(fd.get("client_id") as string) : null,
        workspace_id: currentWorkspace?.id
      })
    });
    setShowNewTaskModal(false);
    setSelectedDealForTask(null);
    fetchData();
  };

  const handleUpdateTask = async () => {
    if (!editTask) return;
    await fetch(`/api/tasks/${editTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTask.title, description: editTask.description,
        due_date: editTask.due_date ? new Date(editTask.due_date).toISOString() : null, priority: editTask.priority,
        status: editTask.status, assignee_id: editTask.assignee_id
      })
    });
    setShowEditTaskModal(false);
    setEditTask(null);
    fetchData();
  };

  // ─── Deal Actions ────────────────────────────────────────────────────────────
  const handleCreateDeal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fd.get("title"), value: parseFloat(fd.get("value") as string),
        contact_id: parseInt(fd.get("contact_id") as string),
        stage: fd.get("stage"), workspace_id: currentWorkspace?.id
      })
    });
    setShowNewDealModal(false);
    fetchData();
  };

  const updateDealStage = async (id: number, stage: string) => {
    await fetch(`/api/deals/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage })
    });
    fetchData();
  };

  const updateDealDetails = async () => {
    if (!selectedDeal) return;
    await fetch(`/api/deals/${selectedDeal.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: selectedDeal.title, value: selectedDeal.value,
        stage: selectedDeal.stage, risk_score: selectedDeal.risk_score,
        win_probability: selectedDeal.win_probability, notes: selectedDeal.notes
      })
    });
    setShowDealEditModal(false);
    setSelectedDeal(null);
    fetchData();
  };

  const deleteDeal = async (id: number) => {
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
    fetchData();
  };

  // ─── Overdue Reason ──────────────────────────────────────────────────────────
  const submitOverdueReason = async () => {
    if (!overdueTask || !overdueReasonText.trim()) return;
    setOverdueReasonSaving(true);
    await fetch(`/api/tasks/${overdueTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overdue_reason: overdueReasonText.trim(), overdue_reason_at: new Date().toISOString() })
    });
    setOverdueTask(null);
    setOverdueReasonText("");
    setOverdueReasonSaving(false);
    fetchData();
  };

  // ─── Time Tracker ────────────────────────────────────────────────────────────
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

  // ─── Client Actions ───────────────────────────────────────────────────────────
  const handleCreateClient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch("/api/clients", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"), industry: fd.get("industry"),
        status: fd.get("status"), onboarding_stage: fd.get("onboarding_stage"),
        contact_person: fd.get("contact_person"), contact_email: fd.get("contact_email"),
        contact_phone: fd.get("contact_phone"), monthly_value: parseFloat(String(fd.get("monthly_value") || "0")),
        notes: fd.get("notes"), workspace_id: currentWorkspace?.id
      })
    });
    setShowNewClientModal(false);
    fetchData();
  };

  const handleUpdateClient = async (e: React.FormEvent<HTMLFormElement>) => {
    if (!editClient) return;
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/clients/${editClient.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"), industry: fd.get("industry"),
        status: fd.get("status"), onboarding_stage: fd.get("onboarding_stage"),
        contact_person: fd.get("contact_person"), contact_email: fd.get("contact_email"),
        contact_phone: fd.get("contact_phone"), monthly_value: parseFloat(String(fd.get("monthly_value") || "0")),
        notes: fd.get("notes")
      })
    });
    setShowEditClientModal(false);
    setEditClient(null);
    fetchData();
  };

  const deleteClient = async (id: number) => {
    if (!confirm("Delete this client? This cannot be undone.")) return;
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    fetchData();
  };

  // ─── Contact Actions ──────────────────────────────────────────────────────────
  const deleteContact = async (id: number) => {
    if (!confirm("Delete this contact? This cannot be undone.")) return;
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    fetchData();
  };

  const handleCreateContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch("/api/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"), company: fd.get("company"),
        email: fd.get("email"), phone: fd.get("phone"),
        status: "Lead", source: fd.get("source"), workspace_id: currentWorkspace?.id
      })
    });
    setShowNewContactModal(false);
    fetchData();
  };

  // ─── Knowledge Base (Admin CRUD) ─────────────────────────────────────────────
  const handleCreateKnowledge = async () => {
    if (!kbTitle.trim() || !kbContent.trim() || !kbCategory) return;
    await fetch("/api/knowledge", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: kbTitle.trim(), content: kbContent.trim(), category: kbCategory })
    });
    setShowNewKnowledgeModal(false);
    setKbTitle(""); setKbContent(""); setKbCategory("Services");
    fetchData();
  };

  const handleUpdateKnowledge = async () => {
    if (!editKnowledge) return;
    await fetch(`/api/knowledge/${editKnowledge.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editKnowledge.title, content: editKnowledge.content, category: editKnowledge.category })
    });
    setShowEditKnowledgeModal(false);
    setEditKnowledge(null);
    fetchData();
  };

  const handleDeleteKnowledge = async (id: number) => {
    if (!confirm("Delete this knowledge entry?")) return;
    await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    fetchData();
  };

  // ─── Team Chat ───────────────────────────────────────────────────────────────
  const sendChatMessage = async () => {
    if (!chatInput.trim() || !currentUser || !currentWorkspace) return;
    const text = chatInput.trim();
    const payload = { workspace_id: currentWorkspace.id, user_id: currentUser.id, user_name: currentUser.name, text };
    setChatInput("");
    setChatMessages(prev => [...prev, { id: Date.now(), user: currentUser.name, text, created_at: new Date().toISOString() }]);
    await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  };

  const saveMeetingLink = async () => {
    if (!currentWorkspace?.id) return;
    setIsMeetingSaving(true);
    try {
      await fetch(`/api/workspace-settings/${currentWorkspace.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_link: meetingLink.trim() })
      });
    } finally { setIsMeetingSaving(false); }
  };

  const disconnectZoom = async () => {
    if (!currentWorkspace?.id) return;
    await fetch(`/api/zoom/disconnect?workspace_id=${currentWorkspace.id}`, { method: "DELETE" });
    setZoomConnected(false);
    setZoomEmail("");
    setZoomMeetings([]);
  };

  const fetchAdminData = async () => {
    const [overviewRes, providerRes] = await Promise.all([
      fetch("/api/admin/overview"),
      fetch("/api/ai/providers"),
    ]);
    if (overviewRes.ok) setAdminData(await overviewRes.json());
    if (providerRes.ok) setAiProviderData(await providerRes.json());
  };

  const scheduleZoomMeeting = async () => {
    if (!currentWorkspace?.id || !zoomTopic || !zoomDate) return;
    setIsScheduling(true);
    try {
      const startTime = `${zoomDate}T${zoomTime}:00`;
      const resp = await fetch("/api/zoom/meetings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: currentWorkspace.id, topic: zoomTopic, start_time: startTime, duration: Number(zoomDuration) })
      });
      if (resp.ok) {
        const meeting = await resp.json();
        setZoomMeetings(prev => [...prev, meeting]);
        setShowScheduleModal(false);
        setZoomTopic(""); setZoomDate(""); setZoomTime("09:00"); setZoomDuration("60");
      }
    } finally { setIsScheduling(false); }
  };

  // ─── Login Screen ─────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="h-screen w-full flex overflow-hidden" style={{ background: "var(--silk-creme)" }}>

        {/* Grain overlay */}
        <svg className="grain-overlay">
          <filter id="noiseFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#noiseFilter)" />
        </svg>

        {/* TFA overlay */}
        <AnimatePresence>
          {showTfa && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6" style={{ background: "var(--deep-forest)" }}>
              <div className="w-10 h-10 border-2 border-[var(--silk-creme)] border-t-transparent rounded-full animate-spin" />
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", letterSpacing: "4px", textTransform: "uppercase", color: "var(--silk-creme)", opacity: 0.7 }}>Authenticating</div>
              <div className="w-48 h-0.5" style={{ background: "rgba(244,235,208,0.15)" }}>
                <div className="h-full transition-all duration-100" style={{ width: `${tfaProgress}%`, background: "var(--silk-creme)" }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left visual panel — hidden on mobile */}
        <div className="hidden md:flex relative overflow-hidden flex-col justify-between" style={{ width: "55%", background: "var(--deep-forest)", padding: "60px" }}>
          <div className="silk-texture" />
          <div style={{ position: "relative", zIndex: 10 }}>
            <img src="https://eiden-group.com/wp-content/uploads/2025/11/ChatGPT-Image-Nov-25-2025-03_46_55-PM.png" alt="Eiden Group" style={{ height: 140, width: "auto", opacity: 0.95 }} />
          </div>
          <div style={{ position: "relative", zIndex: 10, color: "var(--silk-creme)" }}>
            <h1 style={{ fontSize: "clamp(3rem,7vw,5.5rem)", lineHeight: 0.9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-2px" }}>
              Verdant<br />Intelligence
            </h1>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", marginTop: 20, maxWidth: 380, fontSize: "0.82rem", opacity: 0.5, lineHeight: 1.6 }}>
              High-fidelity client relationship management — built for precision, speed, and team clarity.
            </p>
          </div>
          <div style={{ position: "relative", zIndex: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "var(--silk-creme)", opacity: 0.35, letterSpacing: "1px" }}>
            © {new Date().getFullYear()} EIDEN GROUP
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex-1 flex items-center justify-center p-8 sm:p-12 relative overflow-y-auto" style={{ background: "var(--silk-creme)" }}>
          {/* Decorative vertical tag */}
          <div className="hidden lg:block absolute bottom-10 right-10 text-[10px] tracking-[3px] opacity-15"
            style={{ fontFamily: "'JetBrains Mono', monospace", writingMode: "vertical-rl", color: "var(--deep-forest)" }}>
            SECURE · WORKSPACE
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.23,1,0.32,1] }}
            className="w-full" style={{ maxWidth: 400 }}>

            {/* Form header */}
            <header className="mb-12">
              <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(18,38,32,0.45)" }}>
                {view === "login" ? "Access Portal" : view === "register" ? "New Account" : "Recovery"}
              </div>
              <h2 style={{ fontSize: "2.2rem", fontWeight: 700, letterSpacing: "-1px", color: "var(--deep-forest)", lineHeight: 1.1 }}>
                {view === "login" ? "Welcome back." : view === "register" ? "Join the team." : "Reset access."}
              </h2>
            </header>

            {view === "login" && (
              <div>
                <div className="mb-10">
                  <AuthField label="Identity / Username">
                    <input type="text" value={loginUser} onChange={e => { setLoginUser(e.target.value); setLoginError(null); }}
                      onKeyDown={e => e.key === "Enter" && handleLogin()}
                      placeholder="your.username" className="flash-input" autoComplete="username" />
                  </AuthField>
                </div>
                <div className="mb-10">
                  <AuthField label="Security Code">
                    <input type="password" value={loginPass} onChange={e => { setLoginPass(e.target.value); setLoginError(null); }}
                      onKeyDown={e => e.key === "Enter" && handleLogin()}
                      placeholder="••••••••" className="flash-input" autoComplete="current-password" />
                  </AuthField>
                </div>
                {loginError && (
                  <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="mb-6 px-4 py-3 text-[0.8rem]"
                    style={{ border: "1px solid rgba(139,58,58,0.3)", color: "var(--danger)", background: "rgba(139,58,58,0.04)" }}>
                    {loginError}
                  </motion.div>
                )}
                <div className="space-y-3 mt-14">
                  <button onClick={handleLogin} className="flash-button">
                    <span>ENTER ENVIRONMENT</span>
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </button>
                  <button onClick={() => { setView("register"); setRegStep(0); }}
                    className="w-full py-4 text-[0.75rem] text-center transition-all"
                    style={{ border: "1px solid rgba(18,38,32,0.12)", background: "transparent", fontFamily: "'JetBrains Mono', monospace", color: "rgba(18,38,32,0.55)", cursor: "pointer", letterSpacing: "1px", textTransform: "uppercase" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--pure-white)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--deep-forest)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(18,38,32,0.12)"; }}>
                    Request Credentials
                  </button>
                </div>
                <div className="flex gap-6 mt-10">
                  <button onClick={() => setView("recovery")} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "rgba(18,38,32,0.35)", textTransform: "uppercase", letterSpacing: "1px", background: "none", border: "none", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--deep-forest)")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(18,38,32,0.35)")}>
                    Recovery
                  </button>
                  <span style={{ color: "rgba(18,38,32,0.2)", fontSize: "0.65rem" }}>·</span>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "rgba(18,38,32,0.25)", textTransform: "uppercase", letterSpacing: "1px" }}>
                    Eiden Group CRM
                  </div>
                </div>
              </div>
            )}

            {view === "register" && (
              <div>
                {/* Step progress */}
                <div className="flex gap-1.5 mb-12">
                  {[0, 1].map(i => (
                    <div key={i} className="flex-1 h-0.5 transition-all" style={{ background: i <= regStep ? "var(--deep-forest)" : "rgba(18,38,32,0.12)", transitionDuration: "0.4s" }} />
                  ))}
                </div>
                {regStep === 0 && (
                  <div className="space-y-8">
                    <AuthField label="Full Name">
                      <input type="text" placeholder="Your full name" className="flash-input" value={regName}
                        onChange={e => { setRegName(e.target.value); setRegError(null); }} />
                    </AuthField>
                    <AuthField label="Email">
                      <input type="email" placeholder="yourname@eiden-group.com" className="flash-input" value={regEmail}
                        onChange={e => { setRegEmail(e.target.value); setRegError(null); }} />
                    </AuthField>
                    <AuthField label="Your Role">
                      <select className="flash-input" value={regRole} onChange={e => { setRegRole(e.target.value); setRegError(null); }}>
                        <option value="">Select your role...</option>
                        <optgroup label="Management">
                          <option value="Operational Manager">Operational Manager</option>
                          <option value="Admin Coordinator">Admin Coordinator</option>
                          <option value="Brand Manager">Brand Manager</option>
                          <option value="Branding and Strategy Manager">Branding and Strategy Manager</option>
                          <option value="Solution Architect">Solution Architect</option>
                        </optgroup>
                        <optgroup label="Creative &amp; Design">
                          <option value="Designer">Designer</option>
                          <option value="Video Editor">Video Editor</option>
                          <option value="Web Developer">Web Developer</option>
                        </optgroup>
                        <optgroup label="Marketing &amp; Content">
                          <option value="Community Manager">Community Manager</option>
                          <option value="Content Creator">Content Creator</option>
                          <option value="Content Strategy">Content Strategy</option>
                          <option value="Marketing Strategy">Marketing Strategy</option>
                        </optgroup>
                        <optgroup label="Technical &amp; Sales">
                          <option value="DevOps">DevOps</option>
                          <option value="Sales">Sales</option>
                          <option value="Commercial">Commercial</option>
                        </optgroup>
                        <optgroup label="Executive">
                          <option value="Eiden Global">Eiden Global</option>
                          <option value="Eiden HQ">Eiden HQ</option>
                        </optgroup>
                      </select>
                    </AuthField>
                    {regError && <div className="px-4 py-3 text-[0.78rem]" style={{ border: "1px solid rgba(139,58,58,0.3)", color: "var(--danger)" }}>{regError}</div>}
                    <button onClick={() => { if (regName && regEmail && regRole) { setRegError(null); setRegStep(1); } else setRegError("Fill in all fields"); }} className="flash-button mt-6">
                      <span>CONTINUE</span>
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </button>
                  </div>
                )}
                {regStep === 1 && (
                  <div className="space-y-8">
                    <div className="py-3" style={{ borderBottom: "1px solid rgba(18,38,32,0.1)" }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", color: "rgba(18,38,32,0.4)", textTransform: "uppercase", letterSpacing: "1px" }}>
                        {regRole}
                      </div>
                    </div>
                    <AuthField label="Username">
                      <input type="text" placeholder="unique_username" className="flash-input" value={regUsername}
                        onChange={e => { setRegUsername(e.target.value); setRegError(null); }} />
                    </AuthField>
                    <AuthField label="Password">
                      <input type="password" placeholder="Min 6 characters" className="flash-input" value={regPassword}
                        onChange={e => { setRegPassword(e.target.value); setRegError(null); }} />
                    </AuthField>
                    {regError && <div className="px-4 py-3 text-[0.78rem]" style={{ border: "1px solid rgba(139,58,58,0.3)", color: "var(--danger)" }}>{regError}</div>}
                    <button onClick={handleRegister} disabled={isRegistering} className="flash-button mt-6">
                      <span>{isRegistering ? "CREATING ACCOUNT..." : "CREATE ACCOUNT"}</span>
                      {!isRegistering && <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>}
                    </button>
                    <button onClick={() => setRegStep(0)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "rgba(18,38,32,0.4)", textTransform: "uppercase", letterSpacing: "1px", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
                  </div>
                )}
                {regStep === 2 && (
                  <div className="text-center py-8 space-y-6">
                    <CheckCircle2 size={48} className="mx-auto" style={{ color: "var(--success)", opacity: 0.8 }} />
                    <div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-1px" }}>Account created.</div>
                      <div className="mt-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", color: "rgba(18,38,32,0.45)" }}>You can now sign in with your credentials.</div>
                    </div>
                    <button onClick={() => { setView("login"); setRegStep(0); }} className="flash-button">
                      <span>SIGN IN</span>
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </button>
                  </div>
                )}
                {regStep < 2 && (
                  <button onClick={() => setView("login")} className="mt-4 block" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "rgba(18,38,32,0.35)", textTransform: "uppercase", letterSpacing: "1px", background: "none", border: "none", cursor: "pointer" }}>← Back to sign in</button>
                )}
              </div>
            )}

            {view === "recovery" && (
              <div>
                <p className="mb-10" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", color: "rgba(18,38,32,0.5)", lineHeight: 1.6 }}>Enter your email and we'll send a reset link.</p>
                <AuthField label="Email Address">
                  <input type="email" placeholder="your@email.com" className="flash-input" />
                </AuthField>
                {showRecoveryDone ? (
                  <div className="mt-8 px-4 py-3 text-[0.78rem]" style={{ border: "1px solid rgba(45,90,71,0.4)", color: "var(--success)" }}>Reset link sent — check your inbox.</div>
                ) : (
                  <button onClick={() => setShowRecoveryDone(true)} className="flash-button mt-14">
                    <span>SEND RESET LINK</span>
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </button>
                )}
                <button onClick={() => { setView("login"); setShowRecoveryDone(false); }} className="mt-6 block" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "rgba(18,38,32,0.35)", textTransform: "uppercase", letterSpacing: "1px", background: "none", border: "none", cursor: "pointer" }}>← Back to sign in</button>
              </div>
            )}

          </motion.div>
        </div>
      </div>
    );
  }

  // ─── Main App ─────────────────────────────────────────────────────────────────
  const overdueTasks = filteredTasks.filter(t => isOverdue(t.due_date, t.status));

  return (
    <div className="h-screen w-full flex overflow-hidden" style={{ background: "var(--silk-creme)" }}>

      {/* Grain overlay */}
      <svg className="grain-overlay">
        <filter id="noiseFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noiseFilter)" />
      </svg>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <div className={`fixed lg:static inset-y-0 left-0 z-50 shrink-0 flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 220, background: "var(--deep-forest)", minHeight: "100vh" }}>
        {/* Brand */}
        <div className="flex items-center justify-between gap-3 px-6 py-0" style={{ height: 64, borderBottom: "1px solid rgba(244,235,208,0.08)" }}>
          <div className="flex items-center gap-3">
            <img src="https://eiden-group.com/wp-content/uploads/2025/11/ChatGPT-Image-Nov-25-2025-03_46_55-PM.png" alt="Eiden Group" style={{ height: 38, width: "auto", opacity: 0.92 }} />
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase", color: "var(--silk-creme)", opacity: 0.8 }}>Eiden BSM</div>
          </div>
          <button className="lg:hidden p-1" style={{ color: "rgba(244,235,208,0.4)", background: "none", border: "none", cursor: "pointer" }} onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-6 flex flex-col gap-0 overflow-y-auto">
          <NavItem active={activeTab === "dashboard"} onClick={() => { setActiveTab("dashboard"); setSidebarOpen(false); }} icon={<ActivityIcon size={14} />} label="Dashboard" />
          {perms.tabs.includes("pipeline") && <NavItem active={activeTab === "pipeline"} onClick={() => { setActiveTab("pipeline"); setSidebarOpen(false); }} icon={<TrendingUp size={14} />} label="Pipeline" />}
          {perms.tabs.includes("contacts") && <NavItem active={activeTab === "contacts"} onClick={() => { setActiveTab("contacts"); setSidebarOpen(false); }} icon={<Users size={14} />} label="Contacts" />}
          <NavItem active={activeTab === "tasks"} onClick={() => { setActiveTab("tasks"); setSidebarOpen(false); }} icon={<CheckCircle2 size={14} />} label="Tasks" badge={overdueTasks.length > 0 ? overdueTasks.length : undefined} />
          {perms.tabs.includes("team") && <NavItem active={activeTab === "team"} onClick={() => { setActiveTab("team"); setSidebarOpen(false); }} icon={<Users size={14} />} label="Team" />}
          {perms.tabs.includes("analytics") && <NavItem active={activeTab === "analytics"} onClick={() => { setActiveTab("analytics"); setSidebarOpen(false); }} icon={<BarChart2 size={14} />} label="Analytics" />}
          {perms.tabs.includes("clients") && <NavItem active={activeTab === "clients"} onClick={() => { setActiveTab("clients"); setSidebarOpen(false); }} icon={<Target size={14} />} label="Client Management" />}
          {perms.tabs.includes("time") && <NavItem active={activeTab === "time"} onClick={() => { setActiveTab("time"); setSidebarOpen(false); }} icon={<BarChart2 size={14} />} label="Task Analytics" />}
          {perms.tabs.includes("knowledge_base") && <NavItem active={activeTab === "knowledge_base"} onClick={() => { setActiveTab("knowledge_base"); setSidebarOpen(false); }} icon={<BookOpen size={14} />} label="Knowledge Base" />}
          {perms.tabs.includes("admin") && (
            <>
              <div className="mx-6 my-3" style={{ height: 1, background: "rgba(244,235,208,0.06)" }} />
              <NavItem active={activeTab === "admin"} onClick={() => { setActiveTab("admin"); setSidebarOpen(false); }} icon={<Shield size={14} />} label="Admin Panel" />
            </>
          )}
        </nav>

        {/* Admin Coordinator — all workspace overdue tasks with deadline editing */}
        {currentUser?.role === "Admin Coordinator" && (() => {
          const allOverdue = tasks.filter(t => t.workspace_id === currentWorkspace?.id && isOverdue(t.due_date, t.status));
          if (allOverdue.length === 0) return null;
          return (
            <div className="mx-4 mb-3" style={{ background: "rgba(80,40,10,0.18)", border: "1px solid rgba(200,140,60,0.35)" }}>
              <div className="px-3 py-2" style={{ borderBottom: "1px solid rgba(200,140,60,0.2)" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.56rem", letterSpacing: "1px", textTransform: "uppercase", color: "rgba(240,180,80,0.9)", fontWeight: 700 }}>
                  ⏰ {allOverdue.length} Overdue — Edit Deadlines
                </div>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
                {allOverdue.map(t => (
                  <div key={t.id} className="px-3 py-2" style={{ borderBottom: "1px solid rgba(200,140,60,0.12)" }}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 600, color: "rgba(244,235,208,0.85)", lineHeight: 1.3, marginBottom: 2 }}>{t.title}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(244,235,208,0.4)", marginBottom: 5 }}>
                      {t.assignee_name} · due {formatDueDate(t.due_date)}
                      {t.overdue_reason && <span style={{ color: "rgba(240,180,80,0.7)" }}> · reason submitted</span>}
                    </div>
                    <button onClick={() => { setDeadlineEditTask(t); setDeadlineEditValue(toDatetimeLocal(t.due_date)); }}
                      className="text-left px-2 py-1 w-full"
                      style={{ background: "rgba(200,140,60,0.2)", border: "1px solid rgba(200,140,60,0.35)", color: "rgba(240,180,80,0.9)", fontSize: "0.58rem", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", letterSpacing: "0.5px" }}>
                      ✏ Edit Deadline
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Overdue notification in sidebar — own tasks for other roles */}
        {currentUser?.role !== "Admin Coordinator" && (() => {
          const myOverdue = filteredTasks.filter(t => isOverdue(t.due_date, t.status) && !t.overdue_reason);
          if (myOverdue.length === 0) return null;
          return (
            <div className="mx-4 mb-3 p-3" style={{ background: "rgba(139,58,58,0.15)", border: "1px solid rgba(139,58,58,0.3)" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", letterSpacing: "1px", textTransform: "uppercase", color: "rgba(200,112,112,0.9)", marginBottom: 6 }}>
                ⚠ {myOverdue.length} overdue task{myOverdue.length > 1 ? "s" : ""}
              </div>
              {myOverdue.slice(0, 2).map(t => (
                <button key={t.id} onClick={() => { setOverdueTask(t); setOverdueReasonText(""); }}
                  className="w-full text-left mb-1.5 last:mb-0 px-2 py-1.5"
                  style={{ background: "rgba(139,58,58,0.2)", border: "none", cursor: "pointer", color: "rgba(244,235,208,0.8)", fontSize: "0.7rem", fontFamily: "'Space Grotesk', sans-serif" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.72rem" }}>{t.title}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.57rem", color: "rgba(244,235,208,0.45)", marginTop: 2 }}>Submit reason →</div>
                </button>
              ))}
              {myOverdue.length > 2 && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.57rem", color: "rgba(244,235,208,0.35)", marginTop: 4 }}>+{myOverdue.length - 2} more overdue</div>}
            </div>
          );
        })()}

        {/* User / bottom */}
        <div className="px-6 py-5" style={{ borderTop: "1px solid rgba(244,235,208,0.07)" }}>
          {currentUser?.role === "Admin" && (
            <select value={currentWorkspace?.id} onChange={e => {
              const ws = workspaces.find(w => w.id === parseInt(e.target.value));
              if (ws) setCurrentWorkspace(ws);
            }} className="w-full outline-none mb-4 px-2 py-1.5"
              style={{ border: "1px solid rgba(244,235,208,0.15)", background: "rgba(244,235,208,0.05)", color: "rgba(244,235,208,0.6)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem" }}>
              {workspaces.map(ws => <option key={ws.id} value={ws.id} style={{ background: "#122620" }}>{ws.name}</option>)}
            </select>
          )}
          <div className="mb-4">
            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--silk-creme)" }}>{currentUser?.name}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", marginTop: 3, color: "rgba(244,235,208,0.35)", letterSpacing: "0.5px" }}>{currentUser?.role} · {currentWorkspace?.name}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowProfileModal(true)} className="btn-mini flex-1 justify-center" style={{ borderColor: "rgba(244,235,208,0.15)", color: "rgba(244,235,208,0.5)" }}>
              <Settings size={10} /> Profile
            </button>
            <button onClick={() => { setIsLoggedIn(false); setCurrentUser(null); setCurrentWorkspace(null); localStorage.removeItem("eiden_session"); }} className="btn-mini flex-1 justify-center danger" style={{ borderColor: "rgba(139,58,58,0.4)", color: "rgba(200,112,112,0.8)" }}>
              <LogOut size={10} /> Logout
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <div className="shrink-0 flex items-center justify-between px-4 lg:px-8" style={{ height: 64, background: "var(--pure-white)", borderBottom: "1px solid rgba(18,38,32,0.08)" }}>
          <div className="flex items-center gap-3">
            {/* Hamburger */}
            <button className="lg:hidden flex flex-col gap-1.5 p-1 mr-1" onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <span className="block w-5 h-0.5" style={{ background: "var(--deep-forest)" }} />
              <span className="block w-5 h-0.5" style={{ background: "var(--deep-forest)" }} />
              <span className="block w-5 h-0.5" style={{ background: "var(--deep-forest)" }} />
            </button>
            <h1 style={{ fontSize: "0.95rem", fontWeight: 700, letterSpacing: "-0.3px", color: "var(--deep-forest)", textTransform: "uppercase" }}>
              {activeTab === "dashboard" ? "Dashboard"
               : activeTab === "pipeline" ? "Pipeline"
               : activeTab === "contacts" ? "Contacts"
               : activeTab === "tasks" ? "Tasks"
               : activeTab === "team" ? "Team"
               : activeTab === "analytics" ? "Analytics"
               : activeTab === "clients" ? "Clients"
               : activeTab === "time" ? "Task Analytics"
               : activeTab === "knowledge_base" ? "Knowledge Base"
               : activeTab === "admin" ? "Admin"
               : ""}
            </h1>
            <div className="hidden sm:block w-px h-4 opacity-20" style={{ background: "var(--deep-forest)" }} />
            <span className="hidden sm:block truncate max-w-[120px]" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "rgba(18,38,32,0.4)", letterSpacing: "0.5px" }}>{currentWorkspace?.name}</span>
            {overdueTasks.length > 0 && (
              <span className="hidden md:flex items-center gap-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 600, color: "var(--danger)" }}>
                <AlertTriangle size={11} /> {overdueTasks.length} overdue
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "pipeline" && perms.canCreate && <button onClick={() => setShowNewDealModal(true)} className="btn-primary text-[0.68rem] px-3 py-1.5">+ Deal</button>}
            {activeTab === "contacts" && perms.canCreate && <button onClick={() => setShowNewContactModal(true)} className="btn-primary text-[0.68rem] px-3 py-1.5">+ Contact</button>}
            {activeTab === "tasks" && perms.canCreate && <button onClick={() => { setSelectedDealForTask(null); setShowNewTaskModal(true); }} className="btn-primary text-[0.68rem] px-3 py-1.5">+ Task</button>}
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
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden px-3 sm:px-5 lg:px-8 py-4 lg:py-6" style={{ background: "var(--silk-creme)" }}>
          <AnimatePresence mode="wait">
            {/* ── Dashboard ─────────────────────────────────────── */}
            {activeTab === "dashboard" && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col gap-3 lg:gap-4 overflow-y-auto lg:overflow-hidden">
                {/* Stats row — role-aware */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 lg:gap-3 shrink-0">
                  {perms.canAssignAll ? (
                    <>
                      <StatCard icon={<TrendingUp size={16} />} label="Pipeline Value" value={`$${(stats?.pipelineValue || 0).toLocaleString()}`} color="teal" />
                      <StatCard icon={<Target size={16} />} label="Active Deals" value={String(stats?.activeDeals ?? "—")} color="teal" />
                      <StatCard icon={<Zap size={16} />} label="Win Rate" value={stats?.winRate ?? "—"} color="success" />
                      <StatCard icon={<Users size={16} />} label="Active Clients" value={String(stats?.activeClients ?? "—")} color="teal" />
                      <StatCard icon={<AlertTriangle size={16} />} label="Overdue Tasks" value={String(stats?.overdueTasks ?? 0)} color={stats?.overdueTasks ? "danger" : "muted"} />
                    </>
                  ) : (
                    <>
                      <StatCard icon={<CheckCircle2 size={16} />} label="My Tasks" value={String(filteredTasks.filter(t => t.assignee_id === currentUser?.id).length)} color="teal" />
                      <StatCard icon={<Cpu size={16} />} label="In Progress" value={String(filteredTasks.filter(t => t.assignee_id === currentUser?.id && t.status === "In Progress").length)} color="teal" />
                      <StatCard icon={<CheckCircle2 size={16} />} label="Completed" value={String(filteredTasks.filter(t => t.assignee_id === currentUser?.id && t.status === "Completed").length)} color="success" />
                      <StatCard icon={<AlertTriangle size={16} />} label="Overdue" value={String(filteredTasks.filter(t => t.assignee_id === currentUser?.id && isOverdue(t.due_date, t.status)).length)} color={filteredTasks.filter(t => t.assignee_id === currentUser?.id && isOverdue(t.due_date, t.status)).length > 0 ? "danger" : "muted"} />
                      <StatCard icon={<Clock size={16} />} label="Today's Hours" value={(() => { const todayStr = new Date().toDateString(); const todayMins = timeLogs.filter(l => l.user_id === currentUser?.id && l.end_time && new Date(l.start_time).toDateString() === todayStr).reduce((s, l) => s + (l.duration_minutes || 0), 0); return `${Math.floor(todayMins/60)}h ${todayMins%60}m`; })()} color="teal" />
                    </>
                  )}
                </div>

                {/* AI + Activity row */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px] gap-3 lg:gap-4 min-h-0">
                  {/* AI Chat Panel */}
                  <div className="eiden-card flex flex-col overflow-hidden" style={{ minHeight: 340 }}>
                    <div className="shrink-0 px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2" style={{ background: "var(--deep-forest)", borderBottom: "1px solid rgba(244,235,208,0.08)" }}>
                      <div className="flex items-center gap-2">
                        <Bot size={14} style={{ color: "var(--silk-creme)", opacity: 0.8 }} />
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase", color: "var(--silk-creme)", opacity: 0.8 }}>Eiden AI</span>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--success)" }} />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => sendAiMessage("Give me a morning briefing on the pipeline and top priorities")} className="btn-mini" style={{ fontSize: "0.6rem" }}>Brief</button>
                        <button onClick={() => sendAiMessage("Which tasks are overdue and what should I prioritize?")} className="btn-mini" style={{ fontSize: "0.6rem" }}>Urgent?</button>
                        <button onClick={() => currentWorkspace && clearHistory(currentWorkspace.id)} className="btn-mini" style={{ fontSize: "0.6rem" }}>Clear</button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-3">
                      {aiMessages.length === 0 && (
                        <div className="text-center py-8 space-y-3">
                          <Bot size={32} className="mx-auto opacity-20" style={{ color: "var(--deep-forest)" }} />
                          <div className="text-[0.75rem] text-[var(--gris)]">Ask me anything about your pipeline, tasks, or team.</div>
                          <div className="flex flex-wrap gap-2 justify-center">
                            {["What deals need attention?", "Summarize my tasks", "Pipeline health?", "Any overdue tasks?"].map(q => (
                              <button key={q} onClick={() => sendAiMessage(q)} className="btn-mini">{q}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      {aiMessages.map((msg, i) => (
                        <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          {msg.role === "assistant" && (
                            <div className="shrink-0 w-7 h-7 flex items-center justify-center mt-0.5" style={{ background: "var(--deep-forest)", color: "var(--silk-creme)" }}>
                              <Bot size={13} />
                            </div>
                          )}
                          <div className="max-w-[85%] px-3 py-2 text-[0.8rem] leading-relaxed whitespace-pre-wrap break-words"
                            style={msg.role === "user"
                              ? { background: "var(--deep-forest)", color: "var(--silk-creme)" }
                              : { background: "var(--pure-white)", border: "1px solid rgba(18,38,32,0.1)", color: "var(--deep-forest)" }}>
                            {msg.content.replace(/\{"action".*?\}/gs, "").trim()}
                            {msg.content.includes('"action":"create_task"') && (
                              <div className="mt-2 pt-2 text-[0.68rem] font-semibold" style={{ borderTop: "1px solid rgba(18,38,32,0.1)", color: "var(--success)" }}>✓ Task created</div>
                            )}
                          </div>
                          {msg.role === "user" && (
                            <div className="shrink-0 w-7 h-7 flex items-center justify-center mt-0.5 text-[0.72rem] font-bold" style={{ background: "rgba(18,38,32,0.1)", color: "var(--deep-forest)" }}>
                              {currentUser?.name[0]}
                            </div>
                          )}
                        </div>
                      ))}
                      {isAiThinking && (
                        <div className="flex gap-2.5">
                          <div className="shrink-0 w-7 h-7 flex items-center justify-center" style={{ background: "var(--deep-forest)", color: "var(--silk-creme)" }}>
                            <Bot size={13} />
                          </div>
                          <div className="px-3 py-2" style={{ background: "var(--pure-white)", border: "1px solid rgba(18,38,32,0.1)" }}>
                            <div className="flex gap-1 items-center">
                              {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--deep-forest)", opacity: 0.4, animationDelay: `${d}ms` }} />)}
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={aiEndRef} />
                    </div>

                    {/* Pending AI action — requires explicit confirmation */}
                    {pendingAiAction && (
                      <div className="shrink-0 mx-3 mb-2 p-3" style={{ background: "rgba(18,38,32,0.04)", border: "1.5px solid var(--deep-forest)" }}>
                        <div className="text-[0.6rem] font-bold uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(18,38,32,0.45)" }}>AI wants to perform an action</div>
                        <div className="text-[0.78rem] font-medium mb-3" style={{ color: "var(--deep-forest)" }}>{pendingAiAction.summary}</div>
                        <div className="flex gap-2">
                          <button onClick={async () => { await executeAiAction(pendingAiAction.action, pendingAiAction.data); setPendingAiAction(null); }}
                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", padding: "5px 14px", background: "var(--deep-forest)", color: "var(--silk-creme)", border: "none", cursor: "pointer", flex: 1 }}>
                            CONFIRM
                          </button>
                          <button onClick={() => setPendingAiAction(null)}
                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", padding: "5px 14px", background: "transparent", color: "var(--gris)", border: "1px solid rgba(18,38,32,0.15)", cursor: "pointer", flex: 1 }}>
                            CANCEL
                          </button>
                        </div>
                      </div>
                    )}

                    <form onSubmit={e => { e.preventDefault(); sendAiMessage(); }} className="shrink-0 flex gap-2 p-3" style={{ borderTop: "1px solid rgba(18,38,32,0.07)" }}>
                      <input type="text" value={aiInput} onChange={e => setAiInput(e.target.value)}
                        placeholder="Ask Eiden AI anything…"
                        className="flex-1 outline-none text-[0.82rem]"
                        style={{ border: "none", borderBottom: "1.5px solid rgba(18,38,32,0.15)", padding: "8px 0", fontFamily: "'Space Grotesk', sans-serif", color: "var(--deep-forest)", background: "transparent" }}
                        disabled={isAiThinking} />
                      <button type="submit" disabled={isAiThinking || !aiInput.trim()}
                        className="flex items-center justify-center transition-opacity disabled:opacity-30"
                        style={{ background: "var(--deep-forest)", color: "var(--silk-creme)", width: 38, flexShrink: 0, border: "none", cursor: "pointer" }}>
                        <Send size={14} />
                      </button>
                    </form>
                  </div>

                  {/* Right column */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 lg:gap-4 lg:flex lg:flex-col lg:min-h-0">
                    {/* Overdue tasks */}
                    {overdueTasks.length > 0 && (
                      <div className="sm:col-span-2 lg:col-span-1 shrink-0 p-3 sm:p-4" style={{ border: "1px solid var(--danger)", background: "rgba(139,58,58,0.04)", borderLeft: "3px solid var(--danger)" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle size={12} style={{ color: "var(--danger)" }} />
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--danger)" }}>Overdue Tasks</span>
                        </div>
                        <div className="space-y-1.5">
                          {overdueTasks.slice(0, 3).map(t => (
                            <div key={t.id} className="text-[0.72rem] flex justify-between" style={{ color: "var(--danger)" }}>
                              <span className="truncate font-medium">{t.title}</span>
                              <span className="ml-2 shrink-0 text-[0.65rem]">{formatDueDate(t.due_date)}</span>
                            </div>
                          ))}
                          {overdueTasks.length > 3 && (
                            <button onClick={() => setActiveTab("tasks")} className="text-[0.65rem] font-semibold hover:underline" style={{ color: "var(--danger)" }}>
                              +{overdueTasks.length - 3} more → View all
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* AI Chat History */}
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
                      </div>
                    </div>

                    {/* Pipeline snapshot */}
                    {perms.canAssignAll && (
                    <div className="shrink-0 eiden-card p-3 sm:p-4">
                      <div className="mb-3" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Pipeline Snapshot</div>
                      {["Lead", "Proposal", "Negotiation", "Won"].map(stage => {
                        const count = filteredDeals.filter(d => d.stage === stage).length;
                        const total = filteredDeals.length || 1;
                        const barColor = stage === "Won" ? "var(--success)" : stage === "Lost" ? "var(--danger)" : "var(--deep-forest)";
                        return (
                          <div key={stage} className="mb-2.5">
                            <div className="flex justify-between text-[0.68rem] mb-1">
                              <span className="font-semibold" style={{ color: barColor }}>{stage}</span>
                              <span className="text-[var(--gris)]">{count}</span>
                            </div>
                            <div style={{ height: 2, background: "rgba(18,38,32,0.08)", marginTop: 4 }}>
                              <motion.div initial={{ width: 0 }} animate={{ width: `${(count / total) * 100}%` }} className="h-full" style={{ background: barColor }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Pipeline ──────────────────────────────────────── */}
            {activeTab === "pipeline" && (
              <motion.div key="pipeline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex gap-3 lg:gap-4 overflow-x-auto pb-2">
                {["Lead", "Proposal", "Negotiation", "Won", "Lost"].map(stage => {
                  const stageDeals = filteredDeals.filter(d => d.stage === stage);
                  const accentColor = stage === "Won" ? "var(--success)" : stage === "Lost" ? "var(--danger)" : "var(--deep-forest)";
                  return (
                    <div key={stage} className="w-[240px] sm:w-[270px] shrink-0 flex flex-col"
                      onDragOver={e => e.preventDefault()}
                      onDrop={async e => { const id = Number(e.dataTransfer.getData("dealId")); if (id) await updateDealStage(id, stage); }}>
                      {/* Column header */}
                      <div className="px-3 py-3 mb-3 flex justify-between items-center" style={{ background: "var(--pure-white)", border: "1px solid rgba(18,38,32,0.08)", borderLeft: `3px solid ${accentColor}` }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px", color: accentColor }}>{stage}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[0.65rem] font-bold" style={{ background: accentColor, color: "var(--silk-creme)", padding: "2px 8px", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", letterSpacing: "1px" }}>{stageDeals.length}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.4)" }}>${stageDeals.reduce((s, d) => s + d.value, 0).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                        {stageDeals.map(deal => (
                          <div key={deal.id} draggable onDragStart={e => e.dataTransfer.setData("dealId", deal.id.toString())}
                            className="group cursor-grab relative" style={{ background: "var(--pure-white)", border: "1px solid rgba(18,38,32,0.08)", borderLeft: `3px solid ${accentColor}`, padding: "12px 14px" }}>
                            {/* Corner accent */}
                            <div className="absolute bottom-0 right-0 w-3 h-3 pointer-events-none" style={{ borderBottom: "1.5px solid rgba(18,38,32,0.2)", borderRight: "1.5px solid rgba(18,38,32,0.2)" }} />
                            <div className="mb-2" style={{ fontSize: "0.82rem", fontWeight: 600, lineHeight: 1.3, color: "var(--deep-forest)" }}>{deal.title}</div>
                            <div className="flex justify-between text-[0.72rem] mb-1">
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", fontWeight: 600, color: "var(--deep-forest)" }}>${deal.value.toLocaleString()}</span>
                              <span className="font-medium" style={{ color: deal.risk_score > 50 ? "var(--danger)" : "var(--success)" }}>Risk {deal.risk_score}%</span>
                            </div>
                            {deal.contact_name && <div className="text-[0.65rem] text-[var(--gris)] mb-2">{deal.contact_name}</div>}
                            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => { setSelectedDeal({ ...deal }); setShowDealEditModal(true); }} className="btn-mini" style={{ fontSize: "0.6rem", padding: "3px 8px" }}>Edit</button>
                              {stage !== "Won" && stage !== "Lost" && (
                                <button onClick={() => updateDealStage(deal.id, "Won")} className="btn-mini" style={{ fontSize: "0.6rem", padding: "3px 8px", borderColor: "var(--success)", color: "var(--success)" }}>Won</button>
                              )}
                              <button onClick={() => { setSelectedDealForTask(deal); setShowNewTaskModal(true); }} className="btn-mini" style={{ fontSize: "0.6rem", padding: "3px 8px" }}>+Task</button>
                              {perms.canDelete && <button onClick={() => deleteDeal(deal.id)} className="btn-mini danger" style={{ fontSize: "0.6rem", padding: "3px 8px" }}><Trash2 size={10} /></button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* ── Contacts ──────────────────────────────────────── */}
            {activeTab === "contacts" && (
              <motion.div key="contacts" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col gap-4">
                <div className="shrink-0 grid grid-cols-3 gap-3">
                  <StatCard icon={<Users size={15} />} label="Total Contacts" value={String(filteredContacts.length)} color="teal" />
                  <StatCard icon={<CheckCircle2 size={15} />} label="Active Clients" value={String(filteredContacts.filter(c => c.status === "Active").length)} color="success" />
                  <StatCard icon={<TrendingUp size={15} />} label="Leads" value={String(filteredContacts.filter(c => c.status === "Lead").length)} color="teal" />
                </div>
                <div className="flex-1 eiden-card overflow-hidden flex flex-col">
                  <div className="shrink-0 px-5 py-3" style={{ borderBottom: "1px solid rgba(18,38,32,0.07)", background: "rgba(18,38,32,0.03)" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Contacts — {filteredContacts.length} records</span>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-left min-w-[600px]">
                      <thead className="sticky top-0" style={{ background: "rgba(18,38,32,0.04)" }}>
                        <tr style={{ borderBottom: "1px solid rgba(18,38,32,0.07)" }}>
                          {["Name","Company","Email","Phone","Status","Source","LTV",""].map(h => (
                            <th key={h} className="py-2.5 px-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.35)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredContacts.map(c => (
                          <tr key={c.id} className="text-[0.78rem] transition-colors cursor-default" style={{ borderBottom: "1px solid rgba(18,38,32,0.05)" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(18,38,32,0.025)") }
                            onMouseLeave={e => (e.currentTarget.style.background = "") }>
                            <td className="py-3 px-4" style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--deep-forest)" }}>
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 flex items-center justify-center text-[0.65rem] font-bold shrink-0" style={{ background: "var(--deep-forest)", color: "var(--silk-creme)" }}>{c.name[0]}</div>
                                {c.name}
                              </div>
                            </td>
                            <td className="py-3 px-4" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.5)" }}>{c.company}</td>
                            <td className="py-3 px-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", color: "rgba(18,38,32,0.6)" }}>{c.email}</td>
                            <td className="py-3 px-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", color: "rgba(18,38,32,0.45)" }}>{c.phone || "—"}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 text-[0.6rem] font-bold uppercase"
                                style={{ border: `1px solid ${c.status === "Active" ? "var(--success)" : c.status === "Lead" ? "var(--warning)" : "var(--gris)"}`, color: c.status === "Active" ? "var(--success)" : c.status === "Lead" ? "var(--warning)" : "var(--gris)" }}>
                                {c.status}
                              </span>
                            </td>
                            <td className="py-3 px-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "rgba(18,38,32,0.38)" }}>{c.source || "—"}</td>
                            <td className="py-3 px-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", fontWeight: 600, color: "var(--deep-forest)" }}>${(c.ltv || 0).toLocaleString()}</td>
                            <td className="py-3 px-4">
                              {perms.canDelete && (
                                <button onClick={() => deleteContact(c.id)} className="btn-mini danger" title="Delete contact" style={{ padding: "3px 7px" }}>
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Tasks (Kanban) ───────────────────────────────── */}
            {activeTab === "tasks" && (
              <motion.div key="tasks" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col gap-4">
                {/* Stats row */}
                <div className="shrink-0 grid grid-cols-4 gap-3">
                  <StatCard icon={<Clock size={15} />} label="Pending" value={String(filteredTasks.filter(t => t.status === "Pending").length)} color="warn" />
                  <StatCard icon={<Cpu size={15} />} label="In Progress" value={String(filteredTasks.filter(t => t.status === "In Progress").length)} color="teal" />
                  <StatCard icon={<CheckCircle2 size={15} />} label="Completed" value={String(filteredTasks.filter(t => t.status === "Completed").length)} color="success" />
                  <StatCard icon={<AlertTriangle size={15} />} label="Overdue" value={String(overdueTasks.length)} color={overdueTasks.length > 0 ? "danger" : "muted"} />
                </div>

                {/* Search bar */}
                <div className="shrink-0 flex items-center gap-2 px-4 py-2.5" style={{ background: "var(--pure-white)", border: "1px solid rgba(18,38,32,0.1)" }}>
                  <Search size={13} style={{ color: "rgba(18,38,32,0.35)", flexShrink: 0 }} />
                  <input
                    type="text"
                    value={taskSearch}
                    onChange={e => setTaskSearch(e.target.value)}
                    placeholder="Search tasks by title or assignee…"
                    className="flex-1 text-[0.8rem] outline-none"
                    style={{ border: "none", padding: "4px 0", fontFamily: "'Space Grotesk', sans-serif", color: "var(--deep-forest)", background: "transparent" }}
                  />
                  {taskSearch && (
                    <button onClick={() => setTaskSearch("")} style={{ color: "rgba(18,38,32,0.35)", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}>✕</button>
                  )}
                </div>

                {/* Kanban board */}
                <div className="flex-1 min-h-0 grid grid-cols-3 gap-3 overflow-hidden">
                  {(["Pending","In Progress","Completed"] as const).map((colStatus): React.ReactElement => {
                    const colTasks = filteredTasks.filter(t => t.status === colStatus);
                    const colAccent = colStatus === "Pending" ? "var(--warning)" : colStatus === "In Progress" ? "#2a9d8f" : "var(--success)";
                    return (
                      <div key={colStatus} className="flex flex-col min-h-0 overflow-hidden"
                        style={{ background: "rgba(18,38,32,0.015)", border: "1px solid rgba(18,38,32,0.08)" }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={async e => {
                          e.preventDefault();
                          const taskId = Number(e.dataTransfer.getData("taskId"));
                          if (!taskId) return;
                          const draggedTask = filteredTasks.find(t => t.id === taskId);
                          if (!draggedTask) return;
                          if (perms.canCreate) {
                            await updateTaskStatus(taskId, colStatus);
                          } else if (draggedTask.assignee_id === currentUser?.id) {
                            await updateTaskStatusByEmployee(taskId, colStatus, draggedTask.title);
                          }
                        }}>
                        {/* Column header */}
                        <div className="shrink-0 flex items-center justify-between px-4 py-3"
                          style={{ borderBottom: `2px solid ${colAccent}`, background: "var(--pure-white)" }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: colAccent }}>{colStatus}</span>
                          <span className="text-[0.62rem] font-bold px-2 py-0.5" style={{ background: colAccent + "22", color: colAccent, fontFamily: "'JetBrains Mono', monospace", border: `1px solid ${colAccent}44` }}>{colTasks.length}</span>
                        </div>
                        {/* Cards */}
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                          {colTasks.map((task: Task): React.ReactElement => {
                            const overdue = isOverdue(task.due_date, task.status);
                            return (
                              <div key={task.id}
                                draggable={perms.canCreate || task.assignee_id === currentUser?.id}
                                onDragStart={perms.canCreate || task.assignee_id === currentUser?.id ? e => { e.dataTransfer.setData("taskId", task.id.toString()); e.dataTransfer.effectAllowed = "move"; } : undefined}
                                onClick={() => { setSelectedTaskDetail({ ...task }); setShowTaskDetailModal(true); }}
                                className="group relative select-none"
                                style={{
                                  background: "var(--pure-white)",
                                  border: `1px solid ${overdue ? "rgba(139,58,58,0.25)" : "rgba(18,38,32,0.08)"}`,
                                  borderLeft: `3px solid ${overdue ? "var(--danger)" : colAccent}`,
                                  padding: "11px 13px",
                                  cursor: perms.canCreate || task.assignee_id === currentUser?.id ? "grab" : "pointer",
                                  transition: "box-shadow 0.15s, transform 0.1s",
                                }}
                                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 3px 10px rgba(18,38,32,0.1)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                                onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
                                {/* Title */}
                                <div style={{ fontSize: "0.8rem", fontWeight: 600, lineHeight: 1.3, marginBottom: 5, color: overdue ? "var(--danger)" : "var(--deep-forest)", paddingRight: perms.canCreate ? 36 : 0 }}>
                                  {task.title}
                                </div>
                                {/* Description preview */}
                                {task.description && (
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.57rem", color: "rgba(18,38,32,0.38)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {task.description}
                                  </div>
                                )}
                                {/* Client / Company */}
                                {task.client_name && (
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.56rem", color: "var(--deep-forest)", marginBottom: 5, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    ◈ {task.client_name}
                                  </div>
                                )}
                                {/* Meta */}
                                <div className="flex items-center justify-between gap-2 flex-wrap mt-1">
                                  <span style={{ fontSize: "0.67rem", color: "rgba(18,38,32,0.5)", fontFamily: "'Space Grotesk', sans-serif" }}>{task.assignee_name || "Unassigned"}</span>
                                  <div className="flex items-center gap-1.5">
                                    {/* Priority — editable for managers only, read-only badge for employees */}
                                    {perms.canCreate ? (
                                      <select
                                        value={task.priority}
                                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                        onChange={async (e: React.ChangeEvent<HTMLSelectElement>) => {
                                          e.stopPropagation();
                                          await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priority: e.target.value }) });
                                          fetchData();
                                        }}
                                        className={`px-1.5 py-0.5 text-[0.52rem] font-bold uppercase border cursor-pointer outline-none ${priorityColor(task.priority)}`}
                                        style={{ background: "transparent", fontFamily: "'JetBrains Mono', monospace" }}>
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                      </select>
                                    ) : (
                                      <span className={`px-1.5 py-0.5 text-[0.52rem] font-bold uppercase border ${priorityColor(task.priority)}`}>{task.priority}</span>
                                    )}
                                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.56rem", color: overdue ? "var(--danger)" : "rgba(18,38,32,0.32)" }}>
                                      {formatDueDate(task.due_date)}{overdue ? " ⚠" : ""}
                                    </span>
                                  </div>
                                </div>
                                {/* Overdue: submit reason button */}
                                {overdue && task.assignee_id === currentUser?.id && !task.overdue_reason && (
                                  <button onClick={e => { e.stopPropagation(); setOverdueTask(task); setOverdueReasonText(""); }}
                                    className="mt-2 w-full flex items-center justify-center gap-1 text-[0.57rem] font-semibold uppercase tracking-wide px-2 py-1"
                                    style={{ color: "var(--danger)", border: "1px solid var(--danger)", background: "rgba(139,58,58,0.06)", cursor: "pointer" }}>
                                    <AlertTriangle size={8} /> Submit Overdue Reason
                                  </button>
                                )}
                                {/* Overdue: reason preview */}
                                {overdue && task.overdue_reason && (
                                  <div className="mt-2 text-[0.57rem] italic px-2 py-1" style={{ color: "rgba(18,38,32,0.45)", background: "rgba(18,38,32,0.03)", borderTop: "1px solid rgba(18,38,32,0.06)" }}>
                                    Reason: {task.overdue_reason.slice(0, 55)}{task.overdue_reason.length > 55 ? "…" : ""}
                                  </div>
                                )}
                                {/* Manager/Creator: hover actions */}
                                {perms.canCreate && (
                                  <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                                    <button onClick={e => { e.stopPropagation(); setEditTask({ ...task }); setShowEditTaskModal(true); }}
                                      style={{ color: "var(--deep-forest)", background: "var(--pure-white)", border: "1px solid rgba(18,38,32,0.12)", padding: "3px 5px", cursor: "pointer" }}
                                      className="hover:opacity-70 transition-opacity"><Edit3 size={10} /></button>
                                    <button onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
                                      style={{ color: "var(--gris)", background: "var(--pure-white)", border: "1px solid rgba(18,38,32,0.12)", padding: "3px 5px", cursor: "pointer" }}
                                      className="hover:text-[var(--danger)] transition-colors"><Trash2 size={10} /></button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {colTasks.length === 0 && (
                            <div className="flex items-center justify-center py-8 text-[0.62rem]"
                              style={{ color: "rgba(18,38,32,0.22)", fontFamily: "'JetBrains Mono', monospace", border: "1.5px dashed rgba(18,38,32,0.1)", margin: "4px" }}>
                              {perms.canCreate ? "Drag tasks here" : "Drag your task here"}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Managers: submitted overdue reasons panel */}
                {(["Admin","Eiden HQ","Eiden Global","Operational Manager","Admin Coordinator","Brand Manager","Branding and Strategy Manager","Solution Architect"].includes(currentUser?.role || "")) && (() => {
                  const reasonedTasks = filteredTasks.filter(t => t.overdue_reason);
                  if (reasonedTasks.length === 0) return null;
                  return (
                    <div className="shrink-0 p-4" style={{ border: "1px solid rgba(18,38,32,0.1)", borderLeft: "3px solid var(--warning)", background: "rgba(200,160,60,0.03)" }}>
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={13} style={{ color: "var(--warning)" }} />
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--warning)" }}>Submitted Overdue Reasons ({reasonedTasks.length})</span>
                      </div>
                      <div className="space-y-2">
                        {reasonedTasks.map(t => (
                          <div key={t.id} className="p-3" style={{ border: "1px solid rgba(18,38,32,0.07)", background: "white" }}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-[0.78rem]" style={{ color: "var(--deep-forest)" }}>{t.title}</div>
                                <div className="text-[0.7rem] mt-0.5" style={{ color: "rgba(18,38,32,0.5)" }}>by {t.assignee_name} · due {formatDueDate(t.due_date)}</div>
                                <div className="mt-1.5 text-[0.72rem] italic" style={{ color: "rgba(18,38,32,0.65)" }}>"{t.overdue_reason}"</div>
                              </div>
                              <div className="shrink-0 text-[0.58rem] font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(18,38,32,0.3)" }}>
                                {t.overdue_reason_at ? new Date(t.overdue_reason_at).toLocaleDateString() : ""}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {/* ── Task Analytics (role-aware) ───────────────────── */}
            {activeTab === "time" && (
              <motion.div key="time" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto">
                {((): React.ReactElement => {
                  const isManager = ["Admin","Eiden HQ","Operational Manager","Eiden Global","Admin Coordinator","Brand Manager","Branding and Strategy Manager","Solution Architect"].includes(currentUser?.role || "");
                  const wsUsers = users.filter(u => u.workspace_id === currentWorkspace?.id);
                  const allWsTasks = tasks.filter(t => t.workspace_id === currentWorkspace?.id);

                  if (!isManager) {
                    // ── Employee: own task analytics ──
                    const myTasks = allWsTasks.filter(t => t.assignee_id === currentUser?.id);
                    const pending = myTasks.filter(t => t.status === "Pending");
                    const inProgress = myTasks.filter(t => t.status === "In Progress");
                    const completed = myTasks.filter(t => t.status === "Completed");
                    const overdue = myTasks.filter(t => isOverdue(t.due_date, t.status));
                    const completionRate = myTasks.length > 0 ? Math.round((completed.length / myTasks.length) * 100) : 0;
                    return (
                      <div className="space-y-5 pb-6">
                        {/* Header */}
                        <div className="eiden-card overflow-hidden">
                          <div style={{ background: "var(--deep-forest)", padding: "28px 36px" }}>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", letterSpacing: "2px", textTransform: "uppercase", color: "rgba(244,235,208,0.45)", marginBottom: 6 }}>My Task Analytics</div>
                            <div style={{ fontSize: "1.4rem", fontWeight: 300, color: "var(--silk-creme)", lineHeight: 1.2 }}>{currentUser?.name}</div>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "rgba(244,235,208,0.35)", marginTop: 4 }}>{currentUser?.role}</div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x" style={{ borderColor: "rgba(18,38,32,0.07)", borderTop: "1px solid rgba(18,38,32,0.07)" }}>
                            {[
                              { label: "Total", value: myTasks.length, color: "var(--deep-forest)" },
                              { label: "Active", value: inProgress.length, color: "#2a9d8f" },
                              { label: "Completed", value: completed.length, color: "var(--success)" },
                              { label: "Overdue", value: overdue.length, color: overdue.length > 0 ? "var(--danger)" : "var(--gris)" },
                            ].map(s => (
                              <div key={s.label} className="p-4 text-center">
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.52rem", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.38)", marginBottom: 5 }}>{s.label}</div>
                                <div style={{ fontSize: "1.8rem", fontWeight: 300, color: s.color, lineHeight: 1 }}>{s.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Completion rate */}
                        <div className="eiden-card p-5">
                          <div className="flex justify-between items-center mb-3">
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Completion Rate</span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.2rem", fontWeight: 300, color: completionRate >= 75 ? "var(--success)" : completionRate >= 40 ? "var(--warning)" : "var(--danger)" }}>{completionRate}%</span>
                          </div>
                          <div style={{ height: 8, background: "rgba(18,38,32,0.07)", borderRadius: 4 }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${completionRate}%` }}
                              style={{ height: "100%", background: completionRate >= 75 ? "var(--success)" : completionRate >= 40 ? "var(--warning)" : "var(--danger)", borderRadius: 4 }} />
                          </div>
                          <div className="flex justify-between mt-2">
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(18,38,32,0.3)" }}>0%</span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(18,38,32,0.3)" }}>100%</span>
                          </div>
                        </div>

                        {/* Status breakdown */}
                        <div className="eiden-card p-5">
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)", marginBottom: 16 }}>Tasks by Status</div>
                          <div className="space-y-4">
                            {[
                              { label: "Pending", count: pending.length, color: "var(--warning)" },
                              { label: "In Progress", count: inProgress.length, color: "#2a9d8f" },
                              { label: "Completed", count: completed.length, color: "var(--success)" },
                              { label: "Overdue", count: overdue.length, color: "var(--danger)" },
                            ].map(s => (
                              <div key={s.label}>
                                <div className="flex justify-between mb-1.5">
                                  <span style={{ fontSize: "0.78rem", fontWeight: 500, color: s.color }}>{s.label}</span>
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", fontWeight: 700, color: s.color }}>{s.count}</span>
                                </div>
                                <div style={{ height: 4, background: "rgba(18,38,32,0.06)", borderRadius: 2 }}>
                                  <motion.div initial={{ width: 0 }} animate={{ width: myTasks.length > 0 ? `${(s.count / myTasks.length) * 100}%` : "0%" }}
                                    style={{ height: "100%", background: s.color, borderRadius: 2, minWidth: s.count > 0 ? 4 : 0 }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Task list */}
                        {myTasks.length > 0 && (
                          <div className="eiden-card overflow-hidden">
                            <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(18,38,32,0.07)", background: "rgba(18,38,32,0.02)" }}>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>All My Tasks ({myTasks.length})</span>
                            </div>
                            <div className="divide-y" style={{ borderColor: "rgba(18,38,32,0.05)" }}>
                              {myTasks.map((t: Task): React.ReactElement => {
                                const od = isOverdue(t.due_date, t.status);
                                const statusColor = t.status === "Completed" ? "var(--success)" : t.status === "In Progress" ? "#2a9d8f" : "var(--warning)";
                                return (
                                  <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-[0.8rem] truncate" style={{ color: od ? "var(--danger)" : "var(--deep-forest)" }}>{t.title}</div>
                                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.57rem", color: "rgba(18,38,32,0.4)", marginTop: 2 }}>Due {formatDueDate(t.due_date)}{od ? " ⚠ overdue" : ""}</div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className={`px-1.5 py-0.5 text-[0.5rem] font-bold uppercase border ${priorityColor(t.priority)}`}>{t.priority}</span>
                                      <span className="px-1.5 py-0.5 text-[0.5rem] font-bold uppercase" style={{ color: statusColor, border: `1px solid ${statusColor}22`, background: `${statusColor}11` }}>{t.status}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // ── Manager: all employees analytics ──
                  const totalTasks = allWsTasks.length;
                  const totalCompleted = allWsTasks.filter(t => t.status === "Completed").length;
                  const totalOverdue = allWsTasks.filter(t => isOverdue(t.due_date, t.status)).length;
                  const totalInProgress = allWsTasks.filter(t => t.status === "In Progress").length;
                  return (
                    <div className="space-y-5 pb-6">
                      {/* Header */}
                      <div className="eiden-card overflow-hidden">
                        <div style={{ background: "var(--deep-forest)", padding: "28px 36px" }}>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", letterSpacing: "2px", textTransform: "uppercase", color: "rgba(244,235,208,0.45)", marginBottom: 8 }}>Task Analytics — All Staff</div>
                          <div style={{ fontSize: "1.5rem", fontWeight: 300, color: "var(--silk-creme)", lineHeight: 1.2 }}>Click any employee card to view their full task breakdown</div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x" style={{ borderColor: "rgba(18,38,32,0.07)", borderTop: "1px solid rgba(18,38,32,0.07)" }}>
                          {[
                            { label: "Total Tasks", value: totalTasks, color: "var(--deep-forest)" },
                            { label: "In Progress", value: totalInProgress, color: "#2a9d8f" },
                            { label: "Completed", value: totalCompleted, color: "var(--success)" },
                            { label: "Overdue", value: totalOverdue, color: totalOverdue > 0 ? "var(--danger)" : "var(--gris)" },
                          ].map(s => (
                            <div key={s.label} className="p-4 text-center">
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.52rem", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.38)", marginBottom: 5 }}>{s.label}</div>
                              <div style={{ fontSize: "1.8rem", fontWeight: 300, color: s.color, lineHeight: 1 }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Employee cards grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {wsUsers.map((u: User): React.ReactElement => {
                          const empTasks = allWsTasks.filter(t => t.assignee_id === u.id);
                          const pending = empTasks.filter(t => t.status === "Pending").length;
                          const inProgress = empTasks.filter(t => t.status === "In Progress").length;
                          const completed = empTasks.filter(t => t.status === "Completed").length;
                          const overdue = empTasks.filter(t => isOverdue(t.due_date, t.status)).length;
                          const total = empTasks.length;
                          const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
                          return (
                            <button key={u.id} onClick={() => setSelectedEmployeeAnalytics(u)}
                              className="eiden-card text-left w-full transition-all"
                              style={{ cursor: "pointer", border: "1px solid rgba(18,38,32,0.08)", outline: "none" }}
                              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(18,38,32,0.12)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
                              <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid rgba(18,38,32,0.07)" }}>
                                <div className="w-10 h-10 flex items-center justify-center text-[0.85rem] font-bold shrink-0"
                                  style={{ background: overdue > 0 ? "rgba(139,58,58,0.12)" : "var(--deep-forest)", color: overdue > 0 ? "var(--danger)" : "var(--silk-creme)" }}>
                                  {(u.name?.[0] ?? "?").toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-[0.88rem] truncate" style={{ color: "var(--deep-forest)" }}>{u.name}</div>
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "rgba(18,38,32,0.4)", marginTop: 1 }}>{u.role}</div>
                                </div>
                                {overdue > 0 && (
                                  <span className="shrink-0 flex items-center gap-1 text-[0.58rem] font-bold px-2 py-0.5" style={{ color: "var(--danger)", border: "1px solid var(--danger)", background: "rgba(139,58,58,0.06)" }}>
                                    <AlertTriangle size={9} /> {overdue}
                                  </span>
                                )}
                              </div>
                              <div className="px-5 py-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(18,38,32,0.4)" }}>Completion Rate</span>
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", fontWeight: 700, color: completionRate >= 75 ? "var(--success)" : completionRate >= 40 ? "var(--warning)" : "var(--danger)" }}>{completionRate}%</span>
                                </div>
                                <div style={{ height: 4, background: "rgba(18,38,32,0.06)", borderRadius: 2, overflow: "hidden" }}>
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${completionRate}%` }}
                                    style={{ height: "100%", background: completionRate >= 75 ? "var(--success)" : completionRate >= 40 ? "var(--warning)" : "var(--danger)", borderRadius: 2 }} />
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                  {[
                                    { label: "Total", value: total, color: "var(--deep-forest)" },
                                    { label: "Pending", value: pending, color: "var(--warning)" },
                                    { label: "Active", value: inProgress, color: "#2a9d8f" },
                                    { label: "Done", value: completed, color: "var(--success)" },
                                  ].map(s => (
                                    <div key={s.label} className="text-center p-1.5" style={{ border: "1px solid rgba(18,38,32,0.07)" }}>
                                      <div style={{ fontSize: "1.1rem", fontWeight: 300, color: s.color, lineHeight: 1 }}>{s.value}</div>
                                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.48rem", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(18,38,32,0.35)", marginTop: 2 }}>{s.label}</div>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(18,38,32,0.3)", textAlign: "right" }}>Click for details →</div>
                              </div>
                            </button>
                          );
                        })}
                        {wsUsers.length === 0 && (
                          <div className="col-span-3 py-16 text-center" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", color: "rgba(18,38,32,0.3)" }}>No team members found.</div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {/* ── Team ─────────────────────────────────────────── */}
            {activeTab === "team" && (
              <motion.div key="team" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto">
                <div className="space-y-4 pb-6">
                  <div className="eiden-card overflow-hidden">
                    <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(18,38,32,0.07)", background: "rgba(18,38,32,0.02)" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>
                        Eiden Group — {users.filter((u: User) => u.workspace_id === currentWorkspace?.id).length} Members
                      </span>
                    </div>
                    <div className="divide-y" style={{ borderColor: "rgba(18,38,32,0.06)" }}>
                      {users.filter((u: User) => u.workspace_id === currentWorkspace?.id).map((u: User) => {
                        const memberTaskCount = tasks.filter((t: Task) => t.assignee_id === u.id && t.status !== "Completed").length;
                        const memberOverdueCount = tasks.filter((t: Task) => t.assignee_id === u.id && isOverdue(t.due_date, t.status)).length;
                        const isMe = u.id === currentUser?.id;
                        return (
                          <div key={u.id} className="flex items-center gap-4 px-5 py-4" style={{ background: isMe ? "rgba(18,38,32,0.02)" : "transparent" }}>
                            <div className="w-10 h-10 flex items-center justify-center text-[0.8rem] font-bold shrink-0"
                              style={{ background: isMe ? "var(--deep-forest)" : "rgba(18,38,32,0.08)", color: isMe ? "var(--silk-creme)" : "var(--deep-forest)" }}>
                              {(u.name?.[0] ?? "?").toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[0.85rem] font-semibold" style={{ color: "var(--deep-forest)" }}>{u.name}</span>
                                {isMe && (
                                  <span className="text-[0.52rem] font-bold px-1.5 py-0.5 uppercase tracking-wide"
                                    style={{ background: "var(--deep-forest)", color: "var(--silk-creme)", fontFamily: "'JetBrains Mono', monospace" }}>
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", color: "rgba(18,38,32,0.45)" }}>{u.role}</div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {memberTaskCount > 0 && (
                                <div className="text-center">
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", fontWeight: 700, color: "var(--deep-forest)" }}>{memberTaskCount}</div>
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.5rem", color: "rgba(18,38,32,0.35)", textTransform: "uppercase", letterSpacing: "1px" }}>active</div>
                                </div>
                              )}
                              {memberOverdueCount > 0 && (
                                <div className="text-center">
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", fontWeight: 700, color: "var(--danger)" }}>{memberOverdueCount}</div>
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.5rem", color: "var(--danger)", textTransform: "uppercase", letterSpacing: "1px" }}>overdue</div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Analytics ────────────────────────────────────── */}
            {activeTab === "analytics" && (
              <motion.div key="analytics" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col gap-0 overflow-hidden">
                {/* Sub-tabs */}
                <div className="shrink-0 flex gap-0" style={{ borderBottom: "2px solid rgba(18,38,32,0.08)", background: "var(--pure-white)", paddingLeft: 0 }}>
                  {([
                    { key: "tasks", label: "Tasks" },
                    { key: "pipeline", label: "Pipeline" },
                    { key: "deals", label: "Deals" },
                    { key: "contacts", label: "Contacts" },
                  ] as const).map(s => (
                    <button key={s.key} onClick={() => setAnalyticsSection(s.key)}
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "2px", padding: "10px 20px", background: "none", cursor: "pointer", transition: "all 0.2s", borderBottom: analyticsSection === s.key ? "1.5px solid var(--deep-forest)" : "1.5px solid transparent", borderTop: "none", borderLeft: "none", borderRight: "none", color: analyticsSection === s.key ? "var(--deep-forest)" : "rgba(18,38,32,0.4)", marginBottom: -1 }}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto px-0 py-4">
                {/* ── Tasks sub-tab ── */}
                {analyticsSection === "tasks" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
                  {/* ── Workspace Task Summary ── */}
                  {perms.canAssignAll ? (
                    <>
                      {/* Manager view: workspace-wide stats */}
                      {(() => {
                        const wsTasks = tasks;
                        const total = wsTasks.length;
                        const completed = wsTasks.filter(t => t.status === "Completed").length;
                        const inProgress = wsTasks.filter(t => t.status === "In Progress").length;
                        const overdue = wsTasks.filter(t => isOverdue(t.due_date, t.status)).length;
                        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
                        return (
                          <div className="eiden-card p-6 lg:col-span-2">
                            <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Workspace Task Summary</div>
                            <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>All tasks across the team</div>
                            <div className="grid grid-cols-4 gap-3">
                              {[
                                { label: "Total Tasks", value: total, color: "var(--deep-forest)" },
                                { label: "Completed", value: completed, color: "var(--success)" },
                                { label: "In Progress", value: inProgress, color: "#2a9d8f" },
                                { label: "Overdue", value: overdue, color: overdue > 0 ? "var(--danger)" : "var(--gris)" },
                              ].map(s => (
                                <div key={s.label} className="p-3" style={{ borderLeft: `3px solid ${s.color}` }}>
                                  <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">{s.label}</div>
                                  <div style={{ fontSize: "2rem", fontWeight: 300, color: s.color, lineHeight: 1 }}>{s.value}</div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4">
                              <div className="flex justify-between text-[0.65rem] mb-1" style={{ color: "rgba(18,38,32,0.45)" }}>
                                <span>Completion Rate</span>
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "var(--deep-forest)" }}>{completionRate}%</span>
                              </div>
                              <div className="h-2" style={{ background: "rgba(18,38,32,0.07)" }}>
                                <motion.div initial={{ width: 0 }} animate={{ width: `${completionRate}%` }} className="h-full" style={{ background: "var(--deep-forest)" }} />
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Team Workload — clickable cards */}
                      <div className="eiden-card p-6 lg:col-span-2">
                        <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Team Workload</div>
                        <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Click a member to see their full task breakdown</div>
                        <div className="grid grid-cols-1 gap-2">
                          {users.map(u => {
                            const uTasks = tasks.filter(t => t.assignee_id === u.id);
                            const pending = uTasks.filter(t => t.status === "Pending").length;
                            const inProg = uTasks.filter(t => t.status === "In Progress").length;
                            const done = uTasks.filter(t => t.status === "Completed").length;
                            const ov = uTasks.filter(t => isOverdue(t.due_date, t.status)).length;
                            const rate = uTasks.length > 0 ? Math.round((done / uTasks.length) * 100) : 0;
                            return (
                              <div key={u.id} className="p-3 cursor-pointer transition-all hover:shadow-sm"
                                style={{ border: "1px solid rgba(18,38,32,0.08)", borderLeft: `3px solid ${ov > 0 ? "var(--danger)" : "var(--deep-forest)"}` }}
                                onClick={() => setSelectedEmployeeAnalytics(u)}>
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <div className="font-semibold text-[0.82rem]" style={{ color: "var(--deep-forest)" }}>{u.name}</div>
                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.57rem", color: "rgba(18,38,32,0.38)" }}>{u.role}</div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {ov > 0 && (
                                      <span className="text-[0.62rem] font-bold flex items-center gap-1" style={{ color: "var(--danger)" }}>
                                        <AlertTriangle size={9} /> {ov} overdue
                                      </span>
                                    )}
                                    <div className="text-right">
                                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", fontWeight: 700, color: "var(--deep-forest)" }}>{rate}%</div>
                                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.5rem", color: "rgba(18,38,32,0.35)", textTransform: "uppercase" }}>done</div>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-3 text-[0.65rem] font-semibold mb-2">
                                  <span style={{ color: "var(--warning)" }}>{pending} pending</span>
                                  <span style={{ color: "#2a9d8f" }}>{inProg} active</span>
                                  <span style={{ color: "var(--success)" }}>{done} done</span>
                                  <span style={{ color: "rgba(18,38,32,0.35)" }}>{uTasks.length} total</span>
                                </div>
                                <div className="h-1" style={{ background: "rgba(18,38,32,0.07)" }}>
                                  <div className="h-full" style={{ width: `${rate}%`, background: ov > 0 ? "var(--danger)" : "var(--deep-forest)", minWidth: done > 0 ? 4 : 0 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Priority Distribution */}
                      <div className="eiden-card p-6">
                        <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Priority Distribution</div>
                        <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Tasks by priority level</div>
                        <div className="space-y-4">
                          {[{ p: "High", color: "var(--danger)" }, { p: "Medium", color: "var(--warning)" }, { p: "Low", color: "var(--gris)" }].map(({ p, color }) => {
                            const cnt = tasks.filter(t => t.priority === p).length;
                            const pct = tasks.length > 0 ? (cnt / tasks.length) * 100 : 0;
                            return (
                              <div key={p}>
                                <div className="flex justify-between text-[0.72rem] mb-1.5">
                                  <span className="font-semibold" style={{ color }}>{p}</span>
                                  <span className="text-[var(--gris)]">{cnt} tasks · {Math.round(pct)}%</span>
                                </div>
                                <div style={{ height: 2, background: "rgba(18,38,32,0.08)" }}>
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} className="h-full" style={{ background: color }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-5 flex gap-3">
                          {[{ p: "High", color: "var(--danger)" }, { p: "Medium", color: "var(--warning)" }, { p: "Low", color: "var(--gris)" }].map(({ p, color }) => (
                            <div key={p} className="flex-1 p-3 text-center" style={{ border: `1px solid ${color}`, color }}>
                              <div style={{ fontSize: "1.8rem", fontWeight: 300, lineHeight: 1 }}>{tasks.filter(t => t.priority === p).length}</div>
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.52rem", marginTop: 4, textTransform: "uppercase" }}>{p}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Overdue Tasks Summary */}
                      <div className="eiden-card p-6">
                        <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Overdue Tasks</div>
                        <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Tasks past their deadline</div>
                        {(() => {
                          const overdueTasks = tasks.filter(t => isOverdue(t.due_date, t.status)).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
                          if (overdueTasks.length === 0) return <div className="text-[0.75rem] text-[var(--gris)]">No overdue tasks.</div>;
                          return (
                            <div className="space-y-2">
                              {overdueTasks.slice(0, 8).map(t => {
                                const assignee = users.find(u => u.id === t.assignee_id);
                                const daysOver = Math.floor((Date.now() - new Date(t.due_date).getTime()) / 86400000);
                                return (
                                  <div key={t.id} className="p-2" style={{ border: "1px solid rgba(18,38,32,0.08)", borderLeft: "3px solid var(--danger)" }}>
                                    <div className="flex justify-between">
                                      <div className="font-medium text-[0.78rem] truncate flex-1 mr-2" style={{ color: "var(--deep-forest)" }}>{t.title}</div>
                                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 700, color: "var(--danger)", whiteSpace: "nowrap" }}>{daysOver}d</span>
                                    </div>
                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.57rem", color: "rgba(18,38,32,0.4)", marginTop: 2 }}>{assignee?.name || "Unassigned"} · {t.priority}</div>
                                  </div>
                                );
                              })}
                              {overdueTasks.length > 8 && (
                                <div className="text-center text-[0.65rem]" style={{ color: "var(--danger)" }}>+{overdueTasks.length - 8} more overdue</div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  ) : (
                    /* Employee view: own stats only */
                    <>
                      {(() => {
                        const myTasks = tasks.filter(t => t.assignee_id === currentUser?.id);
                        const overdueCount = myTasks.filter(t => isOverdue(t.due_date, t.status)).length;
                        const completionRate = myTasks.length > 0 ? Math.round((myTasks.filter(t => t.status === "Completed").length / myTasks.length) * 100) : 0;
                        const byStatus = ["Pending","In Progress","Completed"].map(s => ({ label: s, count: myTasks.filter(t => t.status === s).length }));
                        const byPriority = [
                          { label: "High", count: myTasks.filter(t => t.priority === "High").length, color: "var(--danger)" },
                          { label: "Medium", count: myTasks.filter(t => t.priority === "Medium").length, color: "var(--warning)" },
                          { label: "Low", count: myTasks.filter(t => t.priority === "Low").length, color: "var(--gris)" },
                        ];
                        return (
                          <>
                            <div className="eiden-card p-6">
                              <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>My Task Summary</div>
                              <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Your personal task breakdown</div>
                              <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="p-3" style={{ borderLeft: "3px solid var(--deep-forest)" }}>
                                  <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Total Assigned</div>
                                  <div style={{ fontSize: "2rem", fontWeight: 300, color: "var(--deep-forest)", lineHeight: 1 }}>{myTasks.length}</div>
                                </div>
                                <div className="p-3" style={{ borderLeft: `3px solid ${overdueCount > 0 ? "var(--danger)" : "var(--success)"}` }}>
                                  <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Completion Rate</div>
                                  <div style={{ fontSize: "2rem", fontWeight: 300, color: overdueCount > 0 ? "var(--danger)" : "var(--success)", lineHeight: 1 }}>{completionRate}%</div>
                                </div>
                              </div>
                              <div className="mt-3">
                                <div className="h-2 mb-1" style={{ background: "rgba(18,38,32,0.07)" }}>
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${completionRate}%` }} className="h-full" style={{ background: overdueCount > 0 ? "var(--danger)" : "var(--success)" }} />
                                </div>
                                <div className="text-[0.6rem]" style={{ color: "rgba(18,38,32,0.35)", fontFamily: "'JetBrains Mono', monospace" }}>{completionRate}% completed</div>
                              </div>
                            </div>
                            <div className="eiden-card p-6">
                              <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Status Breakdown</div>
                              <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Tasks by current status</div>
                              <div className="space-y-3">
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
                              <div className="mt-5">
                                <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-3">By Priority</div>
                                <div className="flex gap-3">
                                  {byPriority.map(p => (
                                    <div key={p.label} className="flex-1 p-2 text-center" style={{ border: `1px solid ${p.color}`, color: p.color }}>
                                      <div style={{ fontSize: "1.5rem", fontWeight: 300, lineHeight: 1 }}>{p.count}</div>
                                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.52rem", marginTop: 3, textTransform: "uppercase" }}>{p.label}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {overdueCount > 0 && (
                              <div className="eiden-card p-6 lg:col-span-2">
                                <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--danger)" }}>Overdue Tasks</div>
                                <div className="mb-4" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Tasks that have passed their deadline</div>
                                <div className="space-y-2">
                                  {myTasks.filter(t => isOverdue(t.due_date, t.status)).map(t => {
                                    const daysOver = Math.floor((Date.now() - new Date(t.due_date).getTime()) / 86400000);
                                    return (
                                      <div key={t.id} className="flex items-center justify-between p-2" style={{ border: "1px solid rgba(18,38,32,0.08)", borderLeft: "3px solid var(--danger)" }}>
                                        <div>
                                          <div className="font-medium text-[0.8rem]" style={{ color: "var(--deep-forest)" }}>{t.title}</div>
                                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.57rem", color: "rgba(18,38,32,0.4)" }}>{t.priority} · Due {formatDueDate(t.due_date)}</div>
                                        </div>
                                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 700, color: "var(--danger)" }}>{daysOver}d overdue</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            <div className="eiden-card p-6 lg:col-span-2">
                              <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>All My Tasks</div>
                              <div className="mb-4" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Complete task list</div>
                              <div className="space-y-2">
                                {myTasks.length === 0 ? (
                                  <div className="text-[0.75rem] text-[var(--gris)]">No tasks assigned to you.</div>
                                ) : myTasks.map(t => {
                                  const ov = isOverdue(t.due_date, t.status);
                                  const prioColor = t.priority === "High" ? "var(--danger)" : t.priority === "Medium" ? "var(--warning)" : "var(--gris)";
                                  return (
                                    <div key={t.id} className="flex items-center gap-3 p-2" style={{ border: "1px solid rgba(18,38,32,0.07)", borderLeft: `2px solid ${ov ? "var(--danger)" : prioColor}` }}>
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-[0.78rem] truncate" style={{ color: "var(--deep-forest)" }}>{t.title}</div>
                                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(18,38,32,0.38)", marginTop: 1 }}>Due {formatDueDate(t.due_date)} · {t.priority}</div>
                                      </div>
                                      <span className="text-[0.62rem] font-semibold px-2 py-0.5" style={{ background: ov ? "rgba(220,53,69,0.08)" : "rgba(18,38,32,0.06)", color: ov ? "var(--danger)" : "var(--deep-forest)" }}>{ov ? "Overdue" : t.status}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )}

                </div>
                )}

                {/* ── Pipeline sub-tab ── */}
                {analyticsSection === "pipeline" && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
                    {/* Revenue Overview */}
                    <div className="eiden-card p-6">
                      <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Revenue Overview</div>
                      <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Won vs Pending revenue breakdown</div>
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="p-3" style={{ borderLeft: "3px solid var(--success)" }}>
                          <div className="text-[0.6rem] font-bold uppercase tracking-[0.08em] text-[var(--gris)] mb-1">Won Revenue</div>
                          <div style={{ fontSize: "1.8rem", fontWeight: 300, color: "var(--success)", lineHeight: 1 }}>${(financials?.totalRevenue || 0).toLocaleString()}</div>
                        </div>
                        <div className="p-3" style={{ borderLeft: "1.5px solid var(--deep-forest)" }}>
                          <div className="text-[0.6rem] font-bold uppercase tracking-[0.08em] text-[var(--gris)] mb-1">Pipeline</div>
                          <div style={{ fontSize: "1.8rem", fontWeight: 300, color: "var(--deep-forest)", lineHeight: 1 }}>${(financials?.pendingRevenue || 0).toLocaleString()}</div>
                        </div>
                      </div>
                      {financials?.monthly && financials.monthly.length > 0 && (
                        <div>
                          <div className="text-[0.6rem] font-bold uppercase tracking-[0.08em] text-[var(--gris)] mb-3">Monthly Won Revenue</div>
                          <div className="h-28 flex items-end gap-2">
                            {financials.monthly.map((m: any, i: number) => {
                              const maxVal = Math.max(...financials.monthly.map((x: any) => x.total), 1);
                              return (
                                <div key={i} className="flex-1 relative group flex flex-col items-center justify-end h-full">
                                  <div className="opacity-80 hover:opacity-100 transition-opacity w-full"
                                    style={{ height: `${(m.total / maxVal) * 100}%`, minHeight: 4, background: "var(--deep-forest)" }} />
                                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[0.58rem] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity font-semibold" style={{ color: "var(--deep-forest)" }}>
                                    ${m.total.toLocaleString()}
                                  </div>
                                  <div className="text-center mt-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "rgba(18,38,32,0.35)" }}>{m.month?.slice(5) || i + 1}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Pipeline Stage Distribution */}
                    <div className="eiden-card p-6">
                      <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Pipeline Distribution</div>
                      <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Deal stages breakdown</div>
                      <div className="space-y-4">
                        {["Lead", "Proposal", "Negotiation", "Won", "Lost"].map(stage => {
                          const stageDl = filteredDeals.filter(d => d.stage === stage);
                          const pct = filteredDeals.length > 0 ? (stageDl.length / filteredDeals.length) * 100 : 0;
                          const val = stageDl.reduce((s, d) => s + d.value, 0);
                          const barColor = stage === "Won" ? "var(--success)" : stage === "Lost" ? "var(--danger)" : "var(--deep-forest)";
                          return (
                            <div key={stage}>
                              <div className="flex justify-between text-[0.72rem] mb-1.5">
                                <span className="font-semibold" style={{ color: barColor }}>{stage}</span>
                                <span className="text-[var(--gris)]">{stageDl.length} deals · ${val.toLocaleString()}</span>
                              </div>
                              <div style={{ height: 2, background: "rgba(18,38,32,0.08)", marginTop: 4 }}>
                                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} className="h-full" style={{ background: barColor }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Win Rate & Conversion */}
                    <div className="eiden-card p-6">
                      <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Win Rate & Conversion</div>
                      <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Won vs Lost ratio analysis</div>
                      {(() => {
                        const won = filteredDeals.filter(d => d.stage === "Won").length;
                        const lost = filteredDeals.filter(d => d.stage === "Lost").length;
                        const total = filteredDeals.length;
                        const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0;
                        const avgDeal = won > 0 ? Math.round(filteredDeals.filter(d => d.stage === "Won").reduce((s, d) => s + d.value, 0) / won) : 0;
                        const avgProbability = filteredDeals.filter(d => d.stage !== "Won" && d.stage !== "Lost").length > 0
                          ? Math.round(filteredDeals.filter(d => d.stage !== "Won" && d.stage !== "Lost").reduce((s, d) => s + d.win_probability, 0) / filteredDeals.filter(d => d.stage !== "Won" && d.stage !== "Lost").length)
                          : 0;
                        return (
                          <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                              {[
                                { label: "Win Rate", value: `${winRate}%`, color: winRate >= 50 ? "var(--success)" : "var(--warning)" },
                                { label: "Avg Deal", value: `$${avgDeal.toLocaleString()}`, color: "var(--deep-forest)" },
                                { label: "Avg Probability", value: `${avgProbability}%`, color: "#2a9d8f" },
                              ].map(s => (
                                <div key={s.label} className="text-center p-3" style={{ border: "1px solid rgba(18,38,32,0.08)" }}>
                                  <div style={{ fontSize: "1.4rem", fontWeight: 300, color: s.color, lineHeight: 1 }}>{s.value}</div>
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.52rem", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(18,38,32,0.4)", marginTop: 4 }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                            <div>
                              <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-2">Won vs Lost</div>
                              <div className="flex gap-2 h-6">
                                {(won + lost) > 0 ? (
                                  <>
                                    <div style={{ width: `${(won/(won+lost))*100}%`, background: "var(--success)", minWidth: 4 }} title={`Won: ${won}`} />
                                    <div style={{ width: `${(lost/(won+lost))*100}%`, background: "var(--danger)", minWidth: 4 }} title={`Lost: ${lost}`} />
                                  </>
                                ) : <div style={{ width: "100%", background: "rgba(18,38,32,0.06)" }} />}
                              </div>
                              <div className="flex justify-between mt-1">
                                <span className="text-[0.6rem] font-semibold" style={{ color: "var(--success)" }}>Won: {won}</span>
                                <span className="text-[0.6rem] font-semibold" style={{ color: "var(--danger)" }}>Lost: {lost}</span>
                              </div>
                            </div>
                            <div className="p-3" style={{ borderLeft: "3px solid var(--deep-forest)" }}>
                              <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Total Pipeline</div>
                              <div style={{ fontSize: "1.5rem", fontWeight: 300, color: "var(--deep-forest)", lineHeight: 1 }}>{total} deals</div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Client Portfolio */}
                    {perms.tabs.includes("clients") && (
                      <div className="eiden-card p-6">
                        <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Client Portfolio</div>
                        <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Revenue & status distribution</div>
                        {(() => {
                          const wsClients = clients.filter(c => c.workspace_id === currentWorkspace?.id);
                          const totalMRR = wsClients.filter(c => c.status === "Active").reduce((s, c) => s + (c.monthly_value || 0), 0);
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
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Deals sub-tab ── */}
                {analyticsSection === "deals" && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
                    {/* Deal Risk Overview */}
                    <div className="eiden-card p-6">
                      <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Deal Risk Overview</div>
                      <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Active deals sorted by risk score</div>
                      <div className="space-y-3">
                        {filteredDeals.filter(d => d.stage !== "Won" && d.stage !== "Lost")
                          .sort((a, b) => b.risk_score - a.risk_score).map(d => {
                            const riskColor = d.risk_score > 60 ? "var(--danger)" : d.risk_score > 30 ? "var(--warning)" : "var(--success)";
                            return (
                              <div key={d.id} className="p-3" style={{ border: "1px solid rgba(18,38,32,0.08)", borderLeft: `3px solid ${riskColor}` }}>
                                <div className="flex items-center gap-3 mb-2">
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", fontWeight: 700, color: riskColor, width: 36 }}>{d.risk_score}%</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-[0.8rem] truncate" style={{ color: "var(--deep-forest)" }}>{d.title}</div>
                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.57rem", color: "rgba(18,38,32,0.4)", marginTop: 1 }}>{d.contact_name} · {d.stage}</div>
                                  </div>
                                  <span className="text-[0.72rem] font-bold shrink-0" style={{ color: "var(--deep-forest)" }}>${d.value.toLocaleString()}</span>
                                </div>
                                <div style={{ height: 4, background: "rgba(18,38,32,0.06)", borderRadius: 2 }}>
                                  <div style={{ height: "100%", width: `${d.risk_score}%`, background: riskColor, borderRadius: 2 }} />
                                </div>
                                <div className="flex justify-between mt-1">
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.52rem", color: "rgba(18,38,32,0.3)" }}>Win Prob: {d.win_probability}%</span>
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.52rem", color: riskColor }}>Risk: {d.risk_score > 60 ? "High" : d.risk_score > 30 ? "Medium" : "Low"}</span>
                                </div>
                              </div>
                            );
                          })}
                        {filteredDeals.filter(d => d.stage !== "Won" && d.stage !== "Lost").length === 0 && (
                          <div className="py-8 text-center" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", color: "rgba(18,38,32,0.3)" }}>No active deals.</div>
                        )}
                      </div>
                    </div>

                    {/* All Deals List */}
                    <div className="eiden-card p-6">
                      <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>All Deals</div>
                      <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Complete deals list — {filteredDeals.length} total</div>
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {filteredDeals.sort((a, b) => b.value - a.value).map(d => {
                          const stageCol = d.stage === "Won" ? "var(--success)" : d.stage === "Lost" ? "var(--danger)" : d.stage === "Negotiation" ? "var(--warning)" : "var(--deep-forest)";
                          return (
                            <div key={d.id} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid rgba(18,38,32,0.05)" }}>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-[0.78rem] truncate" style={{ color: "var(--deep-forest)" }}>{d.title}</div>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.57rem", color: "rgba(18,38,32,0.4)", marginTop: 1 }}>{d.contact_name}</div>
                              </div>
                              <span className="text-[0.6rem] font-bold px-2 py-0.5" style={{ color: stageCol, border: `1px solid ${stageCol}33`, background: `${stageCol}11` }}>{d.stage}</span>
                              <span className="text-[0.72rem] font-bold shrink-0" style={{ color: "var(--deep-forest)" }}>${d.value.toLocaleString()}</span>
                            </div>
                          );
                        })}
                        {filteredDeals.length === 0 && <div className="py-8 text-center" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", color: "rgba(18,38,32,0.3)" }}>No deals yet.</div>}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Contacts sub-tab ── */}
                {analyticsSection === "contacts" && perms.tabs.includes("contacts") && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
                    {/* Contacts Status */}
                    <div className="eiden-card p-6">
                      <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Contacts Overview</div>
                      <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Status & source breakdown — {filteredContacts.length} total</div>
                      <div className="space-y-4">
                        <div>
                          <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-3">By Status</div>
                          <div className="space-y-3">
                            {["Active","Prospect","Inactive"].map(s => {
                              const cnt = filteredContacts.filter(c => c.status === s).length;
                              const pct = filteredContacts.length > 0 ? (cnt / filteredContacts.length) * 100 : 0;
                              const col = s === "Active" ? "var(--success)" : s === "Prospect" ? "var(--warning)" : "var(--gris)";
                              return (
                                <div key={s}>
                                  <div className="flex justify-between mb-1.5">
                                    <span className="text-[0.75rem] font-semibold" style={{ color: col }}>{s}</span>
                                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", fontWeight: 700, color: col }}>{cnt}</span>
                                  </div>
                                  <div style={{ height: 4, background: "rgba(18,38,32,0.07)", borderRadius: 2 }}>
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} style={{ height: "100%", background: col, borderRadius: 2, minWidth: cnt > 0 ? 4 : 0 }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          <div className="p-3" style={{ borderLeft: "3px solid var(--deep-forest)" }}>
                            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Total LTV</div>
                            <div style={{ fontSize: "1.4rem", fontWeight: 300, color: "var(--deep-forest)", lineHeight: 1 }}>${filteredContacts.reduce((s, c) => s + (c.ltv || 0), 0).toLocaleString()}</div>
                          </div>
                          <div className="p-3" style={{ borderLeft: "1.5px solid var(--success)" }}>
                            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gris)] mb-1">Active</div>
                            <div style={{ fontSize: "1.4rem", fontWeight: 300, color: "var(--success)", lineHeight: 1 }}>{filteredContacts.filter(c => c.status === "Active").length}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Contacts by Source */}
                    <div className="eiden-card p-6">
                      <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Contacts by Source</div>
                      <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Acquisition channel breakdown</div>
                      <div className="space-y-3">
                        {Array.from(new Set(filteredContacts.map(c => c.source).filter(Boolean))).map(src => {
                          const cnt = filteredContacts.filter(c => c.source === src).length;
                          const pct = filteredContacts.length > 0 ? (cnt / filteredContacts.length) * 100 : 0;
                          return (
                            <div key={String(src)}>
                              <div className="flex justify-between mb-1.5">
                                <span className="text-[0.75rem] font-medium" style={{ color: "var(--deep-forest)" }}>{src}</span>
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", fontWeight: 700, color: "var(--deep-forest)" }}>{cnt}</span>
                              </div>
                              <div style={{ height: 4, background: "rgba(18,38,32,0.07)", borderRadius: 2 }}>
                                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} style={{ height: "100%", background: "var(--deep-forest)", borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                        {filteredContacts.length === 0 && <div className="py-8 text-center" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", color: "rgba(18,38,32,0.3)" }}>No contacts yet.</div>}
                      </div>
                    </div>

                    {/* Contacts list */}
                    <div className="eiden-card p-6 lg:col-span-2">
                      <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>All Contacts</div>
                      <div className="mb-4" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Top contacts by LTV</div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {[...filteredContacts].sort((a, b) => (b.ltv || 0) - (a.ltv || 0)).map(c => {
                          const statusColor = c.status === "Active" ? "var(--success)" : c.status === "Prospect" ? "var(--warning)" : "var(--gris)";
                          return (
                            <div key={c.id} className="flex items-center gap-4 py-2" style={{ borderBottom: "1px solid rgba(18,38,32,0.05)" }}>
                              <div className="w-8 h-8 flex items-center justify-center text-[0.7rem] font-bold shrink-0" style={{ background: "var(--deep-forest)", color: "var(--silk-creme)" }}>{c.name?.[0] ?? "?"}</div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-[0.78rem] truncate" style={{ color: "var(--deep-forest)" }}>{c.name}</div>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.57rem", color: "rgba(18,38,32,0.4)", marginTop: 1 }}>{c.company} · {c.source}</div>
                              </div>
                              <span className="text-[0.6rem] font-bold px-1.5 py-0.5" style={{ color: statusColor, border: `1px solid ${statusColor}33` }}>{c.status}</span>
                              <span className="text-[0.72rem] font-bold shrink-0" style={{ color: "var(--deep-forest)" }}>${(c.ltv || 0).toLocaleString()}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                {analyticsSection === "contacts" && !perms.tabs.includes("contacts") && (
                  <div className="flex items-center justify-center h-40" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", color: "rgba(18,38,32,0.3)" }}>You don't have access to contacts data.</div>
                )}

                </div>
              </motion.div>
            )}


            {/* ── Client Management ─────────────────────────────── */}
            {activeTab === "clients" && (
              <motion.div key="clients" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col gap-4">
                {/* Stats */}
                <div className="shrink-0 grid grid-cols-4 gap-3">
                  <StatCard icon={<Users size={15} />} label="Total Clients" value={String(clients.filter(c => c.workspace_id === currentWorkspace?.id).length)} color="teal" />
                  <StatCard icon={<CheckCircle2 size={15} />} label="Active" value={String(clients.filter(c => c.workspace_id === currentWorkspace?.id && c.status === "Active").length)} color="success" />
                  <StatCard icon={<AlertTriangle size={15} />} label="At Risk" value={String(clients.filter(c => c.workspace_id === currentWorkspace?.id && c.status === "At Risk").length)} color="danger" />
                  <StatCard icon={<Target size={15} />} label="Onboarding" value={String(clients.filter(c => c.workspace_id === currentWorkspace?.id && c.status === "Onboarding").length)} color="warn" />
                </div>

                {/* Client table */}
                <div className="flex-1 eiden-card overflow-hidden flex flex-col min-h-0">
                  <div className="shrink-0 px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(18,38,32,0.07)", background: "rgba(18,38,32,0.03)" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>
                      Client Accounts — {clients.filter(c => c.workspace_id === currentWorkspace?.id).length} total
                    </span>
                    {perms.canCreate && (
                      <button onClick={() => setShowNewClientModal(true)} className="btn-primary" style={{ fontSize: "0.65rem", padding: "5px 12px" }}>+ New Client</button>
                    )}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-left" style={{ minWidth: 700 }}>
                      <thead className="sticky top-0" style={{ background: "rgba(18,38,32,0.04)" }}>
                        <tr style={{ borderBottom: "1px solid rgba(18,38,32,0.07)" }}>
                          {["Client","Industry","Status","Onboarding Stage","Contact","Monthly Value",""].map(h => (
                            <th key={h} className="py-2.5 px-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.35)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {clients.filter(c => c.workspace_id === currentWorkspace?.id).map(cl => {
                          const statusColor = cl.status === "Active" ? "var(--success)" : cl.status === "At Risk" ? "var(--danger)" : cl.status === "Onboarding" ? "var(--warning)" : "var(--gris)";
                          const stageColor = cl.onboarding_stage === "Completed" ? "var(--success)" : cl.onboarding_stage === "Negotiation" ? "var(--warning)" : "rgba(18,38,32,0.4)";
                          return (
                            <tr key={cl.id} className="text-[0.78rem] transition-colors" style={{ borderBottom: "1px solid rgba(18,38,32,0.05)", cursor: "default" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "rgba(18,38,32,0.025)")}
                              onMouseLeave={e => (e.currentTarget.style.background = "")}>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 flex items-center justify-center text-[0.65rem] font-bold shrink-0" style={{ background: "var(--deep-forest)", color: "var(--silk-creme)" }}>{cl.name[0]}</div>
                                  <span style={{ fontWeight: 600, color: "var(--deep-forest)" }}>{cl.name}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.5)" }}>{cl.industry || "—"}</td>
                              <td className="py-3 px-4">
                                <span className="px-2 py-0.5 text-[0.6rem] font-bold uppercase" style={{ border: `1px solid ${statusColor}`, color: statusColor }}>{cl.status}</span>
                              </td>
                              <td className="py-3 px-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: stageColor }}>{cl.onboarding_stage || "—"}</td>
                              <td className="py-3 px-4">
                                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--deep-forest)" }}>{cl.contact_person || "—"}</div>
                                {cl.contact_email && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.4)", marginTop: 2 }}>{cl.contact_email}</div>}
                              </td>
                              <td className="py-3 px-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", fontWeight: 600, color: "var(--deep-forest)" }}>
                                ${(cl.monthly_value || 0).toLocaleString()}<span style={{ fontSize: "0.58rem", opacity: 0.45 }}>/mo</span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex gap-1">
                                  {perms.canCreate && <button onClick={() => { setEditClient({...cl}); setShowEditClientModal(true); }} className="btn-mini" style={{ padding: "3px 7px" }}><Edit3 size={11} /></button>}
                                  {perms.canDelete && <button onClick={() => deleteClient(cl.id)} className="btn-mini danger" style={{ padding: "3px 7px" }}><Trash2 size={11} /></button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {clients.filter(c => c.workspace_id === currentWorkspace?.id).length === 0 && (
                          <tr><td colSpan={7} className="py-12 text-center" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", color: "rgba(18,38,32,0.3)" }}>No clients yet — add your first client account above.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Codex ────────────────────────────────────────── */}
            {activeTab === "knowledge_base" && (
              <motion.div key="knowledge_base" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto">
                {/* Category groups */}
                {["Company", "Services", "Methodology", "Results", "Sales", "Brand"].map(cat => {
                  const items = knowledge.filter(k => k.category === cat);
                  if (items.length === 0) return null;
                  return (
                    <div key={cat} className="mb-7">
                      <div className="flex items-center gap-3 mb-3">
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px", color: "rgba(18,38,32,0.4)" }}>{cat}</span>
                        <div className="flex-1" style={{ height: 1, background: "rgba(18,38,32,0.07)" }} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {items.map(item => (
                          <div key={item.id} className="eiden-card p-5 group" style={{ cursor: "pointer" }}>
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <h3 onClick={() => { setSelectedKnowledge(item); setShowKnowledgeModal(true); }} style={{ fontSize: "0.88rem", fontWeight: 700, lineHeight: 1.3, color: "var(--deep-forest)", flex: 1 }}>{item.title}</h3>
                              {currentUser?.role === "Admin" && (
                                <div className="flex gap-1.5 shrink-0">
                                  <button onClick={() => { setEditKnowledge({ ...item }); setShowEditKnowledgeModal(true); }} className="btn-mini" style={{ fontSize: "0.58rem", padding: "3px 7px" }}><Edit3 size={9} /></button>
                                  <button onClick={() => handleDeleteKnowledge(item.id)} className="btn-mini danger" style={{ fontSize: "0.58rem", padding: "3px 7px" }}><Trash2 size={9} /></button>
                                </div>
                              )}
                            </div>
                            <p onClick={() => { setSelectedKnowledge(item); setShowKnowledgeModal(true); }} className="line-clamp-3" style={{ fontSize: "0.75rem", lineHeight: 1.65, color: "rgba(18,38,32,0.5)" }}>{item.content}</p>
                            <div className="flex justify-between items-center mt-4 pt-3" style={{ borderTop: "1px solid rgba(18,38,32,0.06)" }}>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "rgba(18,38,32,0.25)" }}>KB-{item.id.toString().padStart(3, "0")}</span>
                              <span onClick={() => { setSelectedKnowledge(item); setShowKnowledgeModal(true); }} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", fontWeight: 500, color: "var(--deep-forest)" }}>Read →</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {/* Uncategorised */}
                {knowledge.filter(k => !["Company","Services","Methodology","Results","Sales","Brand"].includes(k.category)).length > 0 && (
                  <div className="mb-7">
                    <div className="flex items-center gap-3 mb-3">
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px", color: "rgba(18,38,32,0.4)" }}>Other</span>
                      <div className="flex-1" style={{ height: 1, background: "rgba(18,38,32,0.07)" }} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {knowledge.filter(k => !["Company","Services","Methodology","Results","Sales","Brand"].includes(k.category)).map(item => (
                        <div key={item.id} className="eiden-card p-5 group cursor-pointer">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <h3 onClick={() => { setSelectedKnowledge(item); setShowKnowledgeModal(true); }} style={{ fontSize: "0.88rem", fontWeight: 700, lineHeight: 1.3, color: "var(--deep-forest)", flex: 1 }}>{item.title}</h3>
                            {currentUser?.role === "Admin" && (
                              <div className="flex gap-1.5 shrink-0">
                                <button onClick={() => { setEditKnowledge({ ...item }); setShowEditKnowledgeModal(true); }} className="btn-mini" style={{ fontSize: "0.58rem", padding: "3px 7px" }}><Edit3 size={9} /></button>
                                <button onClick={() => handleDeleteKnowledge(item.id)} className="btn-mini danger" style={{ fontSize: "0.58rem", padding: "3px 7px" }}><Trash2 size={9} /></button>
                              </div>
                            )}
                          </div>
                          <p onClick={() => { setSelectedKnowledge(item); setShowKnowledgeModal(true); }} className="line-clamp-3" style={{ fontSize: "0.75rem", lineHeight: 1.65, color: "rgba(18,38,32,0.5)" }}>{item.content}</p>
                          <div className="flex justify-between items-center mt-4 pt-3" style={{ borderTop: "1px solid rgba(18,38,32,0.06)" }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "rgba(18,38,32,0.25)" }}>KB-{item.id.toString().padStart(3, "0")}</span>
                            <span onClick={() => { setSelectedKnowledge(item); setShowKnowledgeModal(true); }} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", fontWeight: 500, color: "var(--deep-forest)" }}>Read →</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}


            {/* ── Admin Panel ──────────────────────────────────── */}
            {activeTab === "admin" && currentUser?.role === "Admin" && (
              <motion.div key="admin" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col gap-4">
                {/* Sub-tabs */}
                <div className="shrink-0 flex gap-0" style={{ borderBottom: "2px solid rgba(18,38,32,0.08)" }}>
                  {(["workspaces", "users", "ai"] as const).map(s => (
                    <button key={s} onClick={() => setAdminSection(s)}
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "2px", padding: "10px 20px", background: "none", cursor: "pointer", transition: "all 0.2s", borderBottom: adminSection === s ? "1.5px solid var(--deep-forest)" : "1.5px solid transparent", borderTop: "none", borderLeft: "none", borderRight: "none", color: adminSection === s ? "var(--deep-forest)" : "rgba(18,38,32,0.4)", marginBottom: -1 }}>
                      {s === "workspaces" ? "Workspaces" : s === "users" ? "Users" : "AI Settings"}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center pr-1">
                    {adminSection === "workspaces" && (
                      <button onClick={() => setShowCreateWsModal(true)} className="btn-primary" style={{ fontSize: "0.68rem", padding: "5px 14px" }}>+ New Workspace</button>
                    )}
                    <button onClick={fetchAdminData} className="ml-2 text-[var(--gris)] hover:text-[var(--deep-forest)] transition-colors"><RefreshCw size={13} /></button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {!adminData && (
                    <div className="flex items-center justify-center h-full text-[0.75rem] text-[var(--gris)]">Loading...</div>
                  )}

                  {/* Workspaces */}
                  {adminData && adminSection === "workspaces" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                      {adminData.workspaces.map((ws: any) => (
                        <div key={ws.id} className="eiden-card p-5">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--deep-forest)" }}>{ws.name}</div>
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "rgba(18,38,32,0.3)", marginTop: 2 }}>WS-{ws.id}</div>
                            </div>
                            <button onClick={async () => { if (confirm(`Delete "${ws.name}" and all its data?`)) { await fetch(`/api/workspaces/${ws.id}`, { method: "DELETE" }); fetchAdminData(); } }}
                              className="btn-mini danger" style={{ fontSize: "0.6rem" }}><Trash2 size={10} /></button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: "Members", value: ws.members, color: "var(--deep-forest)" },
                              { label: "Deals", value: ws.deals, color: "var(--success)" },
                              { label: "Contacts", value: ws.contacts, color: "var(--warning)" },
                              { label: "Tasks", value: ws.tasks, color: "var(--gris)" },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="p-2 text-center" style={{ border: "1px solid rgba(18,38,32,0.08)" }}>
                                <div style={{ fontSize: "1.4rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.35)", marginTop: 2 }}>{label}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Users */}
                  {/* AI Settings */}
                  {adminSection === "ai" && (
                    <div className="space-y-4 pb-4">
                      <div className="p-4" style={{ border: "1px solid rgba(18,38,32,0.08)", background: "rgba(18,38,32,0.03)" }}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.4)", marginBottom: 4 }}>Active Provider</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--deep-forest)" }}>
                          {aiProviderData?.providers.find((p: any) => p.id === aiProviderData.active)?.name || aiProviderData?.active || "—"}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(aiProviderData?.providers || [
                          { id: "claude",   name: "Claude (Anthropic)", model: "claude-sonnet-4-6",       available: false },
                          { id: "groq",     name: "Groq (Llama 3.3)",  model: "llama-3.3-70b-versatile", available: false },
                          { id: "gemini",   name: "Gemini (Google)",   model: "gemini-1.5-flash",         available: false },
                          { id: "deepseek", name: "DeepSeek",          model: "deepseek-chat",            available: false },
                        ]).map((p: any) => {
                          const isActive = aiProviderData?.active === p.id;
                          const color = p.id === "claude" ? "#c07830" : p.id === "groq" ? "#6a4fc0" : p.id === "gemini" ? "#1a73e8" : "#0f7a6e";
                          return (
                            <div key={p.id} className="p-4 relative" style={{ border: `1px solid ${isActive ? color : "rgba(18,38,32,0.08)"}`, background: isActive ? `${color}10` : "var(--pure-white)" }}>
                              <div className="absolute bottom-0 right-0 w-3 h-3 pointer-events-none" style={{ borderBottom: `1.5px solid ${color}`, borderRight: `1.5px solid ${color}` }} />
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--deep-forest)" }}>{p.name}</div>
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "rgba(18,38,32,0.35)", marginTop: 3 }}>{p.model}</div>
                                </div>
                                {isActive && <span className="text-[0.6rem] font-bold px-2 py-0.5" style={{ background: color, color: "#fff" }}>ACTIVE</span>}
                                {!p.available && <span className="text-[0.6rem] font-bold px-2 py-0.5" style={{ border: "1px solid var(--danger)", color: "var(--danger)" }}>NO KEY</span>}
                              </div>
                              <button
                                disabled={!p.available || isActive}
                                onClick={async () => {
                                  const res = await fetch("/api/ai/provider", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p.id }) });
                                  if (res.ok) fetchAdminData();
                                }}
                                className="btn-primary w-full justify-center"
                                style={{ fontSize: "0.65rem", padding: "6px", background: isActive ? color : "var(--deep-forest)", opacity: (!p.available || isActive) ? 0.5 : 1, cursor: (!p.available || isActive) ? "not-allowed" : "pointer" }}>
                                {isActive ? "✓ In Use" : p.available ? "Switch to this" : "Add key to .env"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ padding: "12px 14px", border: "1px solid rgba(18,38,32,0.07)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "rgba(18,38,32,0.4)", background: "rgba(18,38,32,0.02)", lineHeight: 1.7 }}>
                        To add a provider, set its key in <span className="font-bold" style={{ color: "var(--deep-forest)" }}>.env</span> and restart the server.
                        Free providers: <span className="font-semibold" style={{ color: "var(--success)" }}>Groq</span> · <span className="font-semibold" style={{ color: "var(--success)" }}>Gemini</span>
                      </div>
                    </div>
                  )}

                  {adminData && adminSection === "users" && (
                    <div className="eiden-card overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="sticky top-0" style={{ background: "rgba(18,38,32,0.04)" }}>
                          <tr style={{ borderBottom: "1px solid rgba(18,38,32,0.07)" }}>
                            {["Name", "Email", "Role", "Workspace", "Actions"].map(h => (
                              <th key={h} className="py-2.5 px-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.35)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {adminData.users.map((u: any) => (
                            <tr key={u.id} style={{ borderBottom: "1px solid rgba(18,38,32,0.05)" }}>
                              <td className="py-3 px-4" style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--deep-forest)" }}>{u.name}</td>
                              <td className="py-3 px-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "rgba(18,38,32,0.4)" }}>{u.email}</td>
                              <td className="py-3 px-4">
                                {(() => {
                                  const pendingRole = pendingUserRoles[u.id] ?? u.role;
                                  const isDirty = pendingRole !== u.role;
                                  return (
                                    <div className="flex items-center gap-2">
                                      <select value={pendingRole}
                                        onChange={e => setPendingUserRoles(prev => ({ ...prev, [u.id]: e.target.value }))}
                                        className="text-[0.7rem] outline-none px-2 py-1 font-semibold"
                                        style={{ border: "none", borderBottom: `1px solid ${isDirty ? "var(--warning)" : "rgba(18,38,32,0.15)"}`, background: "transparent", color: isDirty ? "var(--warning)" : "var(--deep-forest)", fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer" }}>
                                        {["Admin", "Eiden HQ", "Eiden Global", "Operational Manager", "Admin Coordinator", "Brand Manager", "Branding and Strategy Manager", "Solution Architect", "Designer", "Video Editor", "Web Developer", "Community Manager", "Content Creator", "Content Strategy", "Marketing Strategy", "DevOps", "Sales", "Commercial", "Intern Designer", "Intern Video Editor", "Intern Web Developer", "Intern Community Manager", "Intern Content Creator", "Intern Content Strategy", "Intern Marketing Strategy", "Intern DevOps", "Intern Sales", "Intern Commercial"].map(r => (
                                          <option key={r} value={r}>{r}</option>
                                        ))}
                                      </select>
                                      {isDirty && (
                                        <button
                                          onClick={async () => {
                                            await fetch(`/api/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: pendingRole }) });
                                            setPendingUserRoles(prev => { const n = { ...prev }; delete n[u.id]; return n; });
                                            fetchAdminData();
                                          }}
                                          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", padding: "3px 8px", background: "var(--deep-forest)", color: "var(--silk-creme)", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
                                          SAVE
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="py-3 px-4">
                                <select value={u.workspace_id || ""} onChange={async e => {
                                  await fetch(`/api/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: e.target.value }) });
                                  fetchAdminData();
                                }} className="text-[0.7rem] outline-none px-2 py-1"
                                  style={{ border: "none", borderBottom: "1px solid rgba(18,38,32,0.15)", background: "transparent", color: "var(--deep-forest)", fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer" }}>
                                  {adminData.workspaces.map((ws: any) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
                                </select>
                              </td>
                              <td className="py-3 px-4">
                                {u.id !== currentUser?.id && (
                                  <button onClick={async () => { if (confirm(`Delete user "${u.name}"?`)) { await fetch(`/api/users/${u.id}`, { method: "DELETE" }); fetchAdminData(); } }}
                                    className="btn-mini danger" style={{ fontSize: "0.6rem" }}><Trash2 size={10} /></button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {/* New Deal */}
        {showNewDealModal && (
          <Modal title="New Deal" onClose={() => setShowNewDealModal(false)}>
            <form onSubmit={handleCreateDeal} className="space-y-4">
              <Field label="Deal Title"><input name="title" required className="field-input" placeholder="e.g. Website Redesign" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Value ($)"><input name="value" type="number" required className="field-input" placeholder="0" min={0} /></Field>
                <Field label="Stage">
                  <select name="stage" required className="field-input">
                    <option value="Lead">Lead</option>
                    <option value="Proposal">Proposal</option>
                    <option value="Negotiation">Negotiation</option>
                  </select>
                </Field>
              </div>
              <Field label="Contact">
                <select name="contact_id" required className="field-input">
                  <option value="">Select contact</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name} — {c.company}</option>)}
                </select>
              </Field>
              <button type="submit" className="flash-button mb-0">Create Deal</button>
            </form>
          </Modal>
        )}

        {/* Edit Deal */}
        {showDealEditModal && selectedDeal && (
          <Modal title={`Edit Deal — ${selectedDeal.title}`} onClose={() => { setShowDealEditModal(false); setSelectedDeal(null); }}>
            <div className="space-y-4">
              <Field label="Title"><input value={selectedDeal.title} onChange={e => setSelectedDeal({ ...selectedDeal, title: e.target.value })} className="field-input" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Value ($)"><input type="number" value={selectedDeal.value} onChange={e => setSelectedDeal({ ...selectedDeal, value: Number(e.target.value) })} className="field-input" /></Field>
                <Field label="Stage">
                  <select value={selectedDeal.stage} onChange={e => setSelectedDeal({ ...selectedDeal, stage: e.target.value })} className="field-input">
                    {["Lead","Proposal","Negotiation","Won","Lost"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Risk Score (%)"><input type="number" min={0} max={100} value={selectedDeal.risk_score} onChange={e => setSelectedDeal({ ...selectedDeal, risk_score: Number(e.target.value) })} className="field-input" /></Field>
                <Field label="Win Probability (%)"><input type="number" min={0} max={100} value={selectedDeal.win_probability} onChange={e => setSelectedDeal({ ...selectedDeal, win_probability: Number(e.target.value) })} className="field-input" /></Field>
              </div>
              <Field label="Notes"><textarea value={selectedDeal.notes || ""} onChange={e => setSelectedDeal({ ...selectedDeal, notes: e.target.value })} className="field-input resize-none h-20" /></Field>
              <button onClick={updateDealDetails} className="flash-button mb-0">Save Changes</button>
            </div>
          </Modal>
        )}

        {/* New Contact */}
        {showNewContactModal && (
          <Modal title="New Contact" onClose={() => setShowNewContactModal(false)}>
            <form onSubmit={handleCreateContact} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Full Name"><input name="name" required className="field-input" placeholder="Jane Smith" /></Field>
                <Field label="Company"><input name="company" className="field-input" placeholder="Acme Corp" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email"><input name="email" type="email" className="field-input" placeholder="jane@acme.com" /></Field>
                <Field label="Phone"><input name="phone" type="tel" className="field-input" placeholder="+1 555-0100" /></Field>
              </div>
              <Field label="Source"><input name="source" className="field-input" placeholder="LinkedIn / Referral / Ads" /></Field>
              <button type="submit" className="flash-button mb-0">Add Contact</button>
            </form>
          </Modal>
        )}

        {/* New Task */}
        {showNewTaskModal && (
          <Modal title={selectedDealForTask ? `New Task for "${selectedDealForTask.title}"` : "New Task"} onClose={() => { setShowNewTaskModal(false); setSelectedDealForTask(null); }}>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <Field label="Task Title"><input name="title" required className="field-input" placeholder="What needs to be done?" /></Field>
              <Field label="Description (optional)"><textarea name="description" className="field-input resize-none h-16" placeholder="Additional context..." /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Assignee">
                  <select name="assignee_id" required className="field-input">
                    {(perms.canAssignAll ? users : users.filter(u => u.id === currentUser?.id)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </Field>
                <Field label="Priority">
                  <select name="priority" className="field-input">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Due Date & Time"><input name="due_date" type="datetime-local" required className="field-input" /></Field>
                <Field label="Client / Company">
                  <select name="client_id" className="field-input">
                    <option value="">None</option>
                    {clients.filter(c => c.workspace_id === currentWorkspace?.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              </div>
              <button type="submit" className="flash-button mb-0">Create Task</button>
            </form>
          </Modal>
        )}

        {/* Task Detail */}
        {showTaskDetailModal && selectedTaskDetail && (
          <Modal title="Task Details" onClose={() => { setShowTaskDetailModal(false); setSelectedTaskDetail(null); }}>
            <div className="space-y-4">
              <div>
                <div className="flex items-start gap-3 flex-wrap">
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: isOverdue(selectedTaskDetail.due_date, selectedTaskDetail.status) ? "var(--danger)" : "var(--deep-forest)", lineHeight: 1.3, flex: 1 }}>
                    {selectedTaskDetail.title}
                  </div>
                  {isOverdue(selectedTaskDetail.due_date, selectedTaskDetail.status) && (
                    <span className="text-[0.58rem] font-bold px-2 py-0.5 uppercase shrink-0" style={{ background: "rgba(139,58,58,0.1)", color: "var(--danger)", border: "1px solid var(--danger)" }}>OVERDUE</span>
                  )}
                </div>
                {selectedTaskDetail.description && (
                  <div className="mt-2 text-[0.78rem]" style={{ color: "rgba(18,38,32,0.55)", lineHeight: 1.65 }}>{selectedTaskDetail.description}</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Assignee", value: selectedTaskDetail.assignee_name || "Unassigned" },
                  { label: "Due Date", value: formatDueDate(selectedTaskDetail.due_date), danger: isOverdue(selectedTaskDetail.due_date, selectedTaskDetail.status) },
                  { label: "Status", value: selectedTaskDetail.status },
                  { label: "Priority", value: selectedTaskDetail.priority },
                ].map(item => (
                  <div key={item.label} className="p-3" style={{ background: "rgba(18,38,32,0.025)", border: "1px solid rgba(18,38,32,0.06)" }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.52rem", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.38)", marginBottom: 5 }}>{item.label}</div>
                    {item.label === "Priority" ? (
                      <span className={`px-2 py-0.5 text-[0.6rem] font-bold uppercase border ${priorityColor(selectedTaskDetail.priority)}`}>{item.value}</span>
                    ) : (
                      <div style={{ fontSize: "0.82rem", fontWeight: 600, color: (item as any).danger ? "var(--danger)" : "var(--deep-forest)" }}>{item.value}</div>
                    )}
                  </div>
                ))}
              </div>
              {(selectedTaskDetail.client_name || selectedTaskDetail.client_id) && (
                <div className="p-3" style={{ background: "rgba(18,38,32,0.025)", border: "1px solid rgba(18,38,32,0.06)" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.52rem", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.38)", marginBottom: 5 }}>Client / Company</div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--deep-forest)" }}>
                    {selectedTaskDetail.client_name || clients.find(c => c.id === selectedTaskDetail.client_id)?.name || "—"}
                  </div>
                </div>
              )}
              {selectedTaskDetail.overdue_reason && (
                <div className="p-3" style={{ background: "rgba(139,58,58,0.04)", border: "1px solid rgba(139,58,58,0.15)", borderLeft: "3px solid var(--danger)" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.52rem", textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--danger)", marginBottom: 5 }}>Overdue Reason</div>
                  <div className="italic text-[0.78rem]" style={{ color: "rgba(18,38,32,0.65)" }}>"{selectedTaskDetail.overdue_reason}"</div>
                  {selectedTaskDetail.overdue_reason_at && (
                    <div className="mt-1 text-[0.6rem]" style={{ color: "rgba(18,38,32,0.35)", fontFamily: "'JetBrains Mono', monospace" }}>
                      {new Date(selectedTaskDetail.overdue_reason_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              )}
              {/* Overdue reason submit — for the assigned employee */}
              {isOverdue(selectedTaskDetail.due_date, selectedTaskDetail.status) && selectedTaskDetail.assignee_id === currentUser?.id && !selectedTaskDetail.overdue_reason && (
                <button
                  onClick={() => { setShowTaskDetailModal(false); setOverdueTask(selectedTaskDetail); setOverdueReasonText(""); setSelectedTaskDetail(null); }}
                  className="flash-button mb-0"
                  style={{ borderColor: "var(--danger)", color: "var(--danger)", width: "100%" }}>
                  Submit Overdue Reason
                </button>
              )}
              {/* Edit — managers only */}
              {perms.canCreate && (
                <button
                  onClick={() => { setShowTaskDetailModal(false); setEditTask({ ...selectedTaskDetail }); setShowEditTaskModal(true); setSelectedTaskDetail(null); }}
                  className="flash-button mb-0" style={{ width: "100%" }}>
                  Edit Task
                </button>
              )}
            </div>
          </Modal>
        )}

        {/* Edit Task */}
        {showEditTaskModal && editTask && (
          <Modal title="Edit Task" onClose={() => { setShowEditTaskModal(false); setEditTask(null); }}>
            <div className="space-y-4">
              <Field label="Title"><input value={editTask.title} onChange={e => setEditTask({ ...editTask, title: e.target.value })} className="field-input" /></Field>
              <Field label="Description"><textarea value={editTask.description || ""} onChange={e => setEditTask({ ...editTask, description: e.target.value })} className="field-input resize-none h-16" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Due Date & Time"><input type="datetime-local" value={toDatetimeLocal(editTask.due_date)} onChange={e => setEditTask({ ...editTask, due_date: e.target.value })} className="field-input" /></Field>
                <Field label="Priority">
                  <select value={editTask.priority} onChange={e => setEditTask({ ...editTask, priority: e.target.value })} className="field-input">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </Field>
              </div>
              <Field label="Status">
                <select value={editTask.status} onChange={e => setEditTask({ ...editTask, status: e.target.value })} className="field-input">
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </Field>
              <Field label="Assignee">
                <select value={editTask.assignee_id} onChange={e => setEditTask({ ...editTask, assignee_id: parseInt(e.target.value) })} className="field-input">
                  {(perms.canAssignAll ? users : users.filter((u: User) => u.id === currentUser?.id)).map((u: User) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <button onClick={handleUpdateTask} className="flash-button mb-0">Save Changes</button>
            </div>
          </Modal>
        )}

        {/* Knowledge detail */}
        {showKnowledgeModal && selectedKnowledge && (
          <Modal title={selectedKnowledge.title} onClose={() => { setShowKnowledgeModal(false); setSelectedKnowledge(null); }}>
            <div className="space-y-5">
              <span style={{ display: "inline-block", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px", color: "rgba(18,38,32,0.5)", padding: "3px 10px", border: "1px solid rgba(18,38,32,0.12)" }}>{selectedKnowledge.category}</span>
              <div className="whitespace-pre-wrap max-h-[55vh] overflow-y-auto" style={{ fontSize: "0.82rem", lineHeight: 1.75, color: "var(--deep-forest)", padding: "16px", background: "rgba(18,38,32,0.025)", borderLeft: "2px solid rgba(18,38,32,0.15)" }}>
                {selectedKnowledge.content}
              </div>
              {currentUser?.role === "Admin" && (
                <div className="flex gap-2">
                  <button onClick={() => { setShowKnowledgeModal(false); setEditKnowledge({ ...selectedKnowledge }); setShowEditKnowledgeModal(true); setSelectedKnowledge(null); }} className="btn-mini flex-1 justify-center"><Edit3 size={11} /> Edit</button>
                  <button onClick={() => { handleDeleteKnowledge(selectedKnowledge.id); setShowKnowledgeModal(false); setSelectedKnowledge(null); }} className="btn-mini danger flex-1 justify-center"><Trash2 size={11} /> Delete</button>
                </div>
              )}
              <button onClick={() => { setShowKnowledgeModal(false); setSelectedKnowledge(null); }} className="flash-button" style={{ marginBottom: 0 }}>
                <span>CLOSE</span>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </Modal>
        )}

        {/* New Knowledge Entry (Admin only) */}
        {showNewKnowledgeModal && (
          <Modal title="New Knowledge Entry" onClose={() => { setShowNewKnowledgeModal(false); setKbTitle(""); setKbContent(""); setKbCategory("Services"); }}>
            <div className="space-y-6">
              <Field label="Title">
                <input type="text" placeholder="e.g. Partnership Policy" className="field-input" value={kbTitle} onChange={e => setKbTitle(e.target.value)} />
              </Field>
              <Field label="Category">
                <select className="field-input" value={kbCategory} onChange={e => setKbCategory(e.target.value)}>
                  <option value="Company">Company</option>
                  <option value="Services">Services</option>
                  <option value="Methodology">Methodology</option>
                  <option value="Results">Results</option>
                  <option value="Sales">Sales</option>
                  <option value="Brand">Brand</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Content">
                <textarea className="field-input resize-none" rows={8} placeholder="Full knowledge content…" value={kbContent} onChange={e => setKbContent(e.target.value)} />
              </Field>
              <button onClick={handleCreateKnowledge} disabled={!kbTitle.trim() || !kbContent.trim()} className="flash-button" style={{ marginBottom: 0 }}>
                <span>PUBLISH ENTRY</span>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
          </Modal>
        )}

        {/* Edit Knowledge Entry (Admin only) */}
        {showEditKnowledgeModal && editKnowledge && (
          <Modal title="Edit Knowledge Entry" onClose={() => { setShowEditKnowledgeModal(false); setEditKnowledge(null); }}>
            <div className="space-y-6">
              <Field label="Title">
                <input type="text" className="field-input" value={editKnowledge.title} onChange={e => setEditKnowledge({ ...editKnowledge, title: e.target.value })} />
              </Field>
              <Field label="Category">
                <select className="field-input" value={editKnowledge.category} onChange={e => setEditKnowledge({ ...editKnowledge, category: e.target.value })}>
                  <option value="Company">Company</option>
                  <option value="Services">Services</option>
                  <option value="Methodology">Methodology</option>
                  <option value="Results">Results</option>
                  <option value="Sales">Sales</option>
                  <option value="Brand">Brand</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Content">
                <textarea className="field-input resize-none" rows={8} value={editKnowledge.content} onChange={e => setEditKnowledge({ ...editKnowledge, content: e.target.value })} />
              </Field>
              <button onClick={handleUpdateKnowledge} className="flash-button" style={{ marginBottom: 0 }}>
                <span>SAVE CHANGES</span>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
          </Modal>
        )}

        {/* Create Workspace */}
        {showCreateWsModal && (
          <Modal title="New Workspace" onClose={() => { setShowCreateWsModal(false); setNewWsName(""); }}>
            <div className="space-y-4">
              <Field label="Workspace / Company Name">
                <input type="text" placeholder="e.g. Acme Corp" className="field-input" value={newWsName}
                  onChange={e => setNewWsName(e.target.value)} />
              </Field>
              <button onClick={async () => {
                if (!newWsName.trim()) return;
                setIsCreatingWs(true);
                const res = await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newWsName.trim() }) });
                if (res.ok) { setShowCreateWsModal(false); setNewWsName(""); fetchAdminData(); }
                setIsCreatingWs(false);
              }} disabled={isCreatingWs || !newWsName.trim()} className="flash-button">
                {isCreatingWs ? "Creating…" : "Create Workspace"}
              </button>
            </div>
          </Modal>
        )}

        {/* Schedule Zoom Meeting */}
        {showScheduleModal && (
          <Modal title="Schedule Zoom Meeting" onClose={() => setShowScheduleModal(false)}>
            <div className="space-y-4">
              <Field label="Topic">
                <input type="text" placeholder="Meeting topic" className="field-input" value={zoomTopic} onChange={e => setZoomTopic(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <input type="date" className="field-input" value={zoomDate} onChange={e => setZoomDate(e.target.value)} />
                </Field>
                <Field label="Time">
                  <input type="time" className="field-input" value={zoomTime} onChange={e => setZoomTime(e.target.value)} />
                </Field>
              </div>
              <Field label="Duration (minutes)">
                <select className="field-input" value={zoomDuration} onChange={e => setZoomDuration(e.target.value)}>
                  {["30","45","60","90","120"].map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </Field>
              <button onClick={scheduleZoomMeeting} disabled={isScheduling || !zoomTopic || !zoomDate} className="flash-button">
                {isScheduling ? "Scheduling…" : "Create Meeting"}
              </button>
            </div>
          </Modal>
        )}

        {/* Overdue Reason Submission */}
        {overdueTask && (
          <Modal title="Task Overdue — Submit Reason" onClose={() => { setOverdueTask(null); setOverdueReasonText(""); }}>
            <div className="space-y-4">
              <div className="p-3" style={{ border: "1px solid var(--danger)", background: "rgba(139,58,58,0.05)", borderLeft: "3px solid var(--danger)" }}>
                <div className="font-semibold text-[0.82rem]" style={{ color: "var(--danger)" }}>{overdueTask.title}</div>
                <div className="text-[0.7rem] mt-0.5" style={{ color: "rgba(18,38,32,0.5)" }}>Due: {formatDueDate(overdueTask.due_date)}</div>
              </div>
              <Field label="Reason for delay">
                <textarea className="field-input resize-none" rows={4} placeholder="Explain why this task is overdue…"
                  value={overdueReasonText} onChange={e => setOverdueReasonText(e.target.value)} />
              </Field>
              <button onClick={submitOverdueReason} disabled={overdueReasonSaving || !overdueReasonText.trim()} className="flash-button" style={{ marginBottom: 0 }}>
                <span>{overdueReasonSaving ? "Submitting…" : "SUBMIT REASON"}</span>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
          </Modal>
        )}

        {/* New Client */}
        {showNewClientModal && (
          <Modal title="New Client" onClose={() => setShowNewClientModal(false)}>
            <form onSubmit={handleCreateClient} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Client Name">
                  <input name="name" required placeholder="e.g. TechCorp" className="field-input" />
                </Field>
                <Field label="Industry">
                  <select name="industry" className="field-input">
                    {["Technology","Marketing","Finance","Healthcare","Retail","Real Estate","Education","Other"].map(i => <option key={i}>{i}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select name="status" className="field-input">
                    <option>Active</option>
                    <option>At Risk</option>
                    <option>Onboarding</option>
                    <option>Churned</option>
                  </select>
                </Field>
                <Field label="Onboarding Stage">
                  <select name="onboarding_stage" className="field-input">
                    <option>Not Started</option>
                    <option>In Progress</option>
                    <option>Completed</option>
                  </select>
                </Field>
                <Field label="Contact Person">
                  <input name="contact_person" placeholder="Full name" className="field-input" />
                </Field>
                <Field label="Contact Email">
                  <input name="contact_email" type="email" placeholder="email@client.com" className="field-input" />
                </Field>
                <Field label="Contact Phone">
                  <input name="contact_phone" placeholder="+1 555 000 0000" className="field-input" />
                </Field>
                <Field label="Monthly Value (USD)">
                  <input name="monthly_value" type="number" placeholder="0" min="0" className="field-input" />
                </Field>
              </div>
              <Field label="Notes">
                <textarea name="notes" className="field-input resize-none" rows={3} placeholder="Optional notes…" />
              </Field>
              <button type="submit" className="flash-button" style={{ marginBottom: 0 }}>
                <span>ADD CLIENT</span>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </form>
          </Modal>
        )}

        {/* Edit Client */}
        {showEditClientModal && editClient && (
          <Modal title="Edit Client" onClose={() => { setShowEditClientModal(false); setEditClient(null); }}>
            <form onSubmit={handleUpdateClient} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Client Name">
                  <input name="name" required defaultValue={editClient.name} className="field-input" />
                </Field>
                <Field label="Industry">
                  <select name="industry" defaultValue={editClient.industry} className="field-input">
                    {["Technology","Marketing","Finance","Healthcare","Retail","Real Estate","Education","Other"].map(i => <option key={i}>{i}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select name="status" defaultValue={editClient.status} className="field-input">
                    <option>Active</option>
                    <option>At Risk</option>
                    <option>Onboarding</option>
                    <option>Churned</option>
                  </select>
                </Field>
                <Field label="Onboarding Stage">
                  <select name="onboarding_stage" defaultValue={editClient.onboarding_stage} className="field-input">
                    <option>Not Started</option>
                    <option>In Progress</option>
                    <option>Completed</option>
                  </select>
                </Field>
                <Field label="Contact Person">
                  <input name="contact_person" defaultValue={editClient.contact_person} className="field-input" />
                </Field>
                <Field label="Contact Email">
                  <input name="contact_email" type="email" defaultValue={editClient.contact_email} className="field-input" />
                </Field>
                <Field label="Contact Phone">
                  <input name="contact_phone" defaultValue={editClient.contact_phone} className="field-input" />
                </Field>
                <Field label="Monthly Value (USD)">
                  <input name="monthly_value" type="number" defaultValue={editClient.monthly_value} min="0" className="field-input" />
                </Field>
              </div>
              <Field label="Notes">
                <textarea name="notes" defaultValue={editClient.notes ?? ""} className="field-input resize-none" rows={3} />
              </Field>
              <button type="submit" className="flash-button" style={{ marginBottom: 0 }}>
                <span>SAVE CHANGES</span>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </form>
          </Modal>
        )}

        {/* Employee Task Analytics Detail Modal */}
        {selectedEmployeeAnalytics && (
          <Modal title={`${selectedEmployeeAnalytics.name} — Task Details`} onClose={() => setSelectedEmployeeAnalytics(null)}>
            {((): React.ReactElement => {
              const empTasks = tasks.filter(t => t.assignee_id === selectedEmployeeAnalytics.id);
              const pending = empTasks.filter(t => t.status === "Pending");
              const inProgress = empTasks.filter(t => t.status === "In Progress");
              const completed = empTasks.filter(t => t.status === "Completed");
              const overdue = empTasks.filter(t => isOverdue(t.due_date, t.status));
              const completionRate = empTasks.length > 0 ? Math.round((completed.length / empTasks.length) * 100) : 0;
              return (
                <div className="space-y-4">
                  {/* Role badge */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 flex items-center justify-center text-[1rem] font-bold" style={{ background: "var(--deep-forest)", color: "var(--silk-creme)" }}>
                      {(selectedEmployeeAnalytics.name?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-[0.92rem]" style={{ color: "var(--deep-forest)" }}>{selectedEmployeeAnalytics.name}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.4)" }}>{selectedEmployeeAnalytics.role}</div>
                    </div>
                  </div>

                  {/* Summary stats */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Total", value: empTasks.length, color: "var(--deep-forest)" },
                      { label: "Pending", value: pending.length, color: "var(--warning)" },
                      { label: "Active", value: inProgress.length, color: "#2a9d8f" },
                      { label: "Done", value: completed.length, color: "var(--success)" },
                    ].map(s => (
                      <div key={s.label} className="text-center p-3" style={{ border: "1px solid rgba(18,38,32,0.08)" }}>
                        <div style={{ fontSize: "1.6rem", fontWeight: 300, color: s.color, lineHeight: 1 }}>{s.value}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.52rem", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(18,38,32,0.35)", marginTop: 4 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Completion rate bar */}
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(18,38,32,0.45)" }}>Completion Rate</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 700, color: completionRate >= 75 ? "var(--success)" : completionRate >= 40 ? "var(--warning)" : "var(--danger)" }}>{completionRate}%</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(18,38,32,0.07)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${completionRate}%`, background: completionRate >= 75 ? "var(--success)" : completionRate >= 40 ? "var(--warning)" : "var(--danger)", borderRadius: 3 }} />
                    </div>
                  </div>

                  {/* Overdue tasks */}
                  {overdue.length > 0 && (
                    <div style={{ border: "1px solid rgba(139,58,58,0.3)", borderLeft: "3px solid var(--danger)", background: "rgba(139,58,58,0.03)" }}>
                      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(139,58,58,0.15)" }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "1px", color: "var(--danger)", fontWeight: 700 }}>⚠ {overdue.length} Overdue Task{overdue.length > 1 ? "s" : ""}</span>
                      </div>
                      {overdue.map(t => (
                        <div key={t.id} className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(139,58,58,0.08)" }}>
                          <div className="font-semibold text-[0.78rem]" style={{ color: "var(--danger)" }}>{t.title}</div>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.57rem", color: "rgba(18,38,32,0.4)", marginTop: 2 }}>Due {t.due_date} {t.overdue_reason ? `· Reason: ${t.overdue_reason.slice(0,60)}` : "· No reason submitted"}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* All tasks list */}
                  {empTasks.length > 0 && (
                    <div className="eiden-card overflow-hidden">
                      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(18,38,32,0.07)", background: "rgba(18,38,32,0.02)" }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(18,38,32,0.45)", fontWeight: 600 }}>All Tasks ({empTasks.length})</span>
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y" style={{ borderColor: "rgba(18,38,32,0.05)" }}>
                        {empTasks.map(t => {
                          const taskOverdue = isOverdue(t.due_date, t.status);
                          const statusColor = t.status === "Completed" ? "var(--success)" : t.status === "In Progress" ? "#2a9d8f" : "var(--warning)";
                          return (
                            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-[0.78rem] truncate" style={{ color: taskOverdue ? "var(--danger)" : "var(--deep-forest)" }}>{t.title}</div>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.56rem", color: "rgba(18,38,32,0.38)", marginTop: 1 }}>Due {t.due_date}{taskOverdue ? " ⚠" : ""}</div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`px-1.5 py-0.5 text-[0.48rem] font-bold uppercase border ${priorityColor(t.priority)}`}>{t.priority}</span>
                                <span className="px-1.5 py-0.5 text-[0.5rem] font-bold uppercase" style={{ color: statusColor, border: `1px solid ${statusColor}`, background: `${statusColor}11` }}>{t.status}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {empTasks.length === 0 && (
                    <div className="py-8 text-center" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", color: "rgba(18,38,32,0.3)" }}>No tasks assigned to this employee.</div>
                  )}

                  <button onClick={() => setSelectedEmployeeAnalytics(null)} className="flash-button" style={{ marginBottom: 0, width: "100%" }}>
                    <span>CLOSE</span>
                  </button>
                </div>
              );
            })()}
          </Modal>
        )}

        {/* Deadline Edit Modal */}
        {deadlineEditTask && (
          <Modal title="Edit Task Deadline" onClose={() => setDeadlineEditTask(null)}>
            <div className="space-y-4">
              <div>
                <div className="text-[0.7rem] font-semibold mb-1" style={{ color: "var(--deep-forest)" }}>Task</div>
                <div className="text-[0.85rem] font-medium" style={{ color: "var(--deep-forest)" }}>{deadlineEditTask.title}</div>
                <div className="text-[0.65rem] mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(18,38,32,0.4)" }}>Current deadline: {formatDueDate(deadlineEditTask.due_date)}</div>
              </div>
              {deadlineEditTask.overdue_reason && (
                <div className="p-3" style={{ background: "rgba(220,53,69,0.04)", border: "1px solid rgba(220,53,69,0.15)", borderLeft: "3px solid var(--danger)" }}>
                  <div className="text-[0.6rem] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--danger)" }}>Employee's Reason</div>
                  <div className="text-[0.78rem]" style={{ color: "var(--deep-forest)" }}>{deadlineEditTask.overdue_reason}</div>
                </div>
              )}
              <div>
                <label className="block text-[0.65rem] font-bold uppercase tracking-wider mb-1.5" style={{ color: "rgba(18,38,32,0.5)" }}>New Deadline</label>
                <input type="datetime-local" value={deadlineEditValue}
                  onChange={e => setDeadlineEditValue(e.target.value)}
                  className="flash-input" style={{ width: "100%" }} />
              </div>
              <div className="flex gap-3">
                <button onClick={saveDeadlineEdit} className="flash-button flex-1">
                  <span>SAVE DEADLINE</span>
                </button>
                <button onClick={() => setDeadlineEditTask(null)} className="flash-button flex-1" style={{ background: "rgba(18,38,32,0.05)", color: "var(--deep-forest)" }}>
                  <span>CANCEL</span>
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Profile */}
        {showProfileModal && (
          <Modal title="Your Profile" onClose={() => setShowProfileModal(false)}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Name", value: currentUser?.name, colored: false },
                  { label: "Role", value: currentUser?.role, colored: true },
                  { label: "Workspace", value: currentWorkspace?.name, colored: false },
                  { label: "Open Tasks", value: `${tasks.filter(t => t.assignee_id === currentUser?.id && t.status !== "Completed").length} open`, colored: true },
                ].map(({ label, value, colored }) => (
                  <div key={label} className="p-3" style={{ border: "1px solid rgba(18,38,32,0.1)" }}>
                    <div className="text-[0.6rem] font-bold uppercase tracking-[0.08em] mb-1" style={{ color: "var(--gris)" }}>{label}</div>
                    <div className="font-semibold text-[0.85rem]" style={{ color: colored ? "var(--deep-forest)" : "var(--deep-forest)" }}>{value}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowProfileModal(false)} className="flash-button" style={{ marginBottom: 0 }}>Close</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Notification toasts */}
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
        {chatToast && (
          <motion.div
            initial={{ opacity: 0, y: 40, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 40, x: "-50%" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            onClick={() => setChatToast(null)}
            className="fixed bottom-6 left-1/2 cursor-pointer z-[9999] flex items-center gap-3 px-5 py-4"
            style={{ background: "var(--deep-forest)", boxShadow: "0 12px 40px rgba(0,0,0,0.35)", minWidth: 260, maxWidth: 360 }}
          >
            <div className="shrink-0 w-8 h-8 flex items-center justify-center text-[0.72rem] font-bold" style={{ background: "rgba(244,235,208,0.15)", color: "var(--silk-creme)", border: "1px solid rgba(244,235,208,0.2)" }}>
              {chatToast.user[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(244,235,208,0.5)", textTransform: "uppercase", letterSpacing: "1px" }}>{chatToast.user}</div>
              <div className="text-[0.78rem] truncate mt-0.5" style={{ color: "var(--silk-creme)", fontWeight: 500 }}>{chatToast.text}</div>
            </div>
            <MessageSquare size={13} style={{ color: "rgba(244,235,208,0.4)", flexShrink: 0 }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── UI Components ────────────────────────────────────────────────────────────
function NavItem({ active, onClick, icon, label, badge, badgeColor }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number | string; badgeColor?: string;
}) {
  return (
    <button onClick={onClick} className={`nav-item-eiden ${active ? "active" : ""}`}>
      <span className="shrink-0 opacity-70">{icon}</span>
      <span>{label}</span>
      {badge != null && (typeof badge === "string" ? badge.length > 0 : badge > 0) && (
        badgeColor ? (
          <span className="ml-auto shrink-0 w-2 h-2 rounded-full animate-pulse" style={{ background: badgeColor, boxShadow: `0 0 6px ${badgeColor}` }} />
        ) : (
          <span className="ml-auto shrink-0 w-4 h-4 flex items-center justify-center text-[8px] font-bold" style={{ background: "var(--danger)", color: "var(--pure-white)" }}>{badge}</span>
        )
      )}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(18,38,32,0.6)", backdropFilter: "blur(6px)" }}>
      <motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        className="w-full max-w-md mx-3 sm:mx-0 relative"
        style={{ background: "var(--pure-white)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.2)" }}>
        {/* Corner accent */}
        <div className="absolute bottom-0 right-0 w-8 h-8 pointer-events-none" style={{ borderBottom: "1.5px solid rgba(18,38,32,0.2)", borderRight: "1.5px solid rgba(18,38,32,0.2)" }} />
        <div className="flex items-center justify-between px-6 sm:px-8 pt-7 pb-5" style={{ borderBottom: "1px solid rgba(18,38,32,0.08)" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "-0.3px", color: "var(--deep-forest)", textTransform: "uppercase" }}>{title}</h2>
          <button onClick={onClose} style={{ color: "rgba(18,38,32,0.35)", background: "none", border: "none", cursor: "pointer", fontSize: "1.3rem", lineHeight: 1, transition: "color 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--danger)")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(18,38,32,0.35)")}>×</button>
        </div>
        <div className="px-6 sm:px-8 py-6 sm:py-7">{children}</div>
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1px", color: "rgba(18,38,32,0.5)", marginBottom: 8 }}>{label}</label>
      {children}
    </div>
  );
}

function AuthField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1px", color: "rgba(18,38,32,0.45)", marginBottom: 10 }}>{label}</label>
      {children}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: "teal" | "success" | "danger" | "warn" | "muted" }) {
  const accent = {
    teal:    "#0c5752",
    success: "#2d5a47",
    danger:  "#8b3a3a",
    warn:    "#a67c37",
    muted:   "#9a9a9a",
  }[color];
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="eiden-card p-4" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center gap-1.5 mb-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1px", color: accent, opacity: 0.8 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: "1.8rem", fontWeight: 300, lineHeight: 1, color: accent }}>{value}</div>
    </motion.div>
  );
}
