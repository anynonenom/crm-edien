/**
 * Eiden AI CRM — powered by Claude (Anthropic)
 * @license Apache-2.0
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Cpu, TrendingUp, Users, Bell, Settings,
  LogOut, Activity as ActivityIcon, CheckCircle2,
  AlertTriangle, Trash2, Edit3, ChevronRight, Send,
  MessageSquare, BarChart2, Bot, X, RefreshCw,
  Clock, Target, Zap, BookOpen, Shield
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "./lib/supabase";

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
  related_deal_id?: number; due_date: string; status: string;
  priority: string; workspace_id: number; created_at?: string;
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
interface Workspace { id: number; name: string; }
interface ChatMessage { id: number; user: string; text: string; created_at: string; }
interface AiMessage { role: "user" | "assistant"; content: string; }
interface ZoomMeeting { id: number; topic: string; start_time: string; duration: number; join_url: string; }

// ─── Permissions ──────────────────────────────────────────────────────────────
const PERMISSIONS: Record<string, { tabs: string[]; canCreate: boolean; canDelete: boolean; canViewAnalytics: boolean }> = {
  "Admin":               { tabs: ["dashboard","pipeline","contacts","tasks","analytics","codex","communications","admin"], canCreate: true,  canDelete: true,  canViewAnalytics: true  },
  "Operational Manager": { tabs: ["dashboard","pipeline","contacts","tasks","analytics","codex","communications"],         canCreate: true,  canDelete: true,  canViewAnalytics: true  },
  "Solution Architect":  { tabs: ["dashboard","pipeline","contacts","tasks","analytics","codex","communications"],         canCreate: true,  canDelete: false, canViewAnalytics: true  },
  "Brand Manager":       { tabs: ["dashboard","pipeline","contacts","tasks","codex","communications"],                     canCreate: true,  canDelete: false, canViewAnalytics: false },
  "Marketing Strategy":  { tabs: ["dashboard","pipeline","contacts","tasks","analytics","codex","communications"],         canCreate: false, canDelete: false, canViewAnalytics: true  },
  "Sales":               { tabs: ["dashboard","pipeline","contacts","tasks","codex","communications"],                     canCreate: true,  canDelete: false, canViewAnalytics: false },
  "Commercial":          { tabs: ["dashboard","pipeline","contacts","tasks","codex","communications"],                     canCreate: true,  canDelete: false, canViewAnalytics: false },
  "Web Developer":       { tabs: ["dashboard","tasks","codex","communications"],                                           canCreate: false, canDelete: false, canViewAnalytics: false },
  "Content Creator":     { tabs: ["dashboard","contacts","tasks","codex","communications"],                                canCreate: false, canDelete: false, canViewAnalytics: false },
};
const getPerms = (role?: string | null) => PERMISSIONS[role ?? ""] ?? { tabs: ["dashboard","tasks","codex","communications"], canCreate: false, canDelete: false, canViewAnalytics: false };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const isOverdue = (dueDate: string, status: string) => {
  if (status === "Completed") return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
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
  const [activeTab, setActiveTab] = useState<"dashboard" | "pipeline" | "contacts" | "tasks" | "analytics" | "codex" | "communications" | "admin">("dashboard");
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
  const [showDealEditModal, setShowDealEditModal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [selectedDealForTask, setSelectedDealForTask] = useState<Deal | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Edit task
  const [editTask, setEditTask] = useState<Task | null>(null);

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
  const [aiProviderData, setAiProviderData] = useState<{ active: string; providers: any[] } | null>(null);
  const [showCreateWsModal, setShowCreateWsModal] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [isCreatingWs, setIsCreatingWs] = useState(false);

  // Registration
  const [regCompany, setRegCompany] = useState("");

  // AI Assistant
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
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
  const filteredDeals = deals.filter(d => d.workspace_id === currentWorkspace?.id);
  const filteredTasks = tasks.filter(t => t.workspace_id === currentWorkspace?.id);
  const filteredContacts = contacts.filter(c => c.workspace_id === currentWorkspace?.id);
  const perms = getPerms(currentUser?.role);

  // ─── Fetch all data ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [statsRes, dealsRes, tasksRes, contactsRes, usersRes, workspacesRes, knowledgeRes, activityRes, financialsRes] = await Promise.all([
        fetch("/api/stats"), fetch("/api/deals"), fetch("/api/tasks"),
        fetch("/api/contacts"), fetch("/api/users"), fetch("/api/workspaces"),
        fetch("/api/knowledge"), fetch("/api/activity"), fetch("/api/financials")
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (dealsRes.ok) setDeals(await dealsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (contactsRes.ok) setContacts(await contactsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (workspacesRes.ok) setWorkspaces(await workspacesRes.json());
      if (knowledgeRes.ok) setKnowledge(await knowledgeRes.json());
      if (activityRes.ok) setActivities(await activityRes.json());
      if (financialsRes.ok) setFinancials(await financialsRes.json());
    } catch (err) { console.error("Fetch error:", err); }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isLoggedIn, fetchData]);

  useEffect(() => {
    if (!isLoggedIn || !currentWorkspace?.id) return;
    fetch(`/api/workspace-settings/${currentWorkspace.id}`)
      .then(r => r.json())
      .then(d => { if (d.meeting_link) setMeetingLink(d.meeting_link); })
      .catch(() => {});
  }, [isLoggedIn, currentWorkspace?.id]);

  // Zoom status + meetings (load when communications tab opens)
  useEffect(() => {
    if (!isLoggedIn || activeTab !== "communications" || !currentWorkspace?.id) return;
    fetch(`/api/zoom/status?workspace_id=${currentWorkspace.id}`)
      .then(r => r.json())
      .then(d => {
        setZoomConnected(d.connected);
        setZoomEmail(d.email || "");
        if (d.connected) {
          fetch(`/api/zoom/meetings?workspace_id=${currentWorkspace.id}`)
            .then(r => r.json())
            .then(meetings => setZoomMeetings(Array.isArray(meetings) ? meetings : []))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [isLoggedIn, activeTab, currentWorkspace?.id]);

  // Handle ?zoom=connected or ?zoom=error after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zoom = params.get("zoom");
    if (zoom) {
      window.history.replaceState({}, "", window.location.pathname);
      if (zoom === "connected") {
        setActiveTab("communications");
      }
    }
  }, []);

  // Team chat — load history when tab opens + clear unread
  useEffect(() => {
    if (!isLoggedIn || activeTab !== "communications" || !currentWorkspace?.id) return;
    fetch(`/api/chat?workspace_id=${currentWorkspace.id}`)
      .then(r => r.json())
      .then(d => setChatMessages(d || []))
      .catch(() => {});
    setChatUnread(0);
  }, [isLoggedIn, activeTab, currentWorkspace?.id]);

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
    if (!trimmed || isAiThinking) return;

    const newMessages: AiMessage[] = [...aiMessages, { role: "user", content: trimmed }];
    setAiMessages(newMessages);
    setAiInput("");
    setIsAiThinking(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages })
      });
      const data = await res.json();

      if (!res.ok) {
        setAiMessages(prev => [...prev, { role: "assistant", content: `Error: ${data.error || "AI unavailable"}` }]);
        return;
      }

      const responseText: string = data.text || "No response.";
      setAiMessages(prev => [...prev, { role: "assistant", content: responseText }]);

      // Parse and execute AI actions
      try {
        const start = responseText.indexOf('"action"');
        let action: any = null;
        if (start !== -1) {
          // Find the opening brace of the action object
          let objStart = responseText.lastIndexOf("{", start);
          if (objStart !== -1) {
            let depth = 0, end = objStart;
            for (let i = objStart; i < responseText.length; i++) {
              if (responseText[i] === "{") depth++;
              else if (responseText[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
            }
            try { action = JSON.parse(responseText.slice(objStart, end + 1)); } catch { action = null; }
          }
        }
        if (action && action.action) {
          if (action.action === "create_task" && action.data) {
            const d = action.data;
            const assignee = users.find(u => u.name.toLowerCase().includes((d.assignee || "").toLowerCase()));
            const taskRes = await fetch("/api/tasks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: d.title,
                description: d.description || "",
                assignee_id: assignee?.id || currentUser?.id,
                due_date: d.due_date || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
                priority: d.priority || "Medium",
                workspace_id: currentWorkspace?.id
              })
            });
            if (taskRes.ok) {
              setAiMessages(prev => [...prev, { role: "assistant", content: `✅ Task "${d.title}" created successfully!` }]);
              await fetchData();
            } else {
              const err = await taskRes.json().catch(() => ({ error: "Unknown error" }));
              setAiMessages(prev => [...prev, { role: "assistant", content: `❌ Failed to create task: ${err.error || taskRes.status}` }]);
            }
          } else if (action.action === "create_deal" && action.data) {
            const d = action.data;
            const dealRes = await fetch("/api/deals", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: d.title,
                value: d.value || 0,
                stage: d.stage || "Lead",
                workspace_id: currentWorkspace?.id
              })
            });
            if (dealRes.ok) {
              setAiMessages(prev => [...prev, { role: "assistant", content: `✅ Deal "${d.title}" created successfully!` }]);
              await fetchData();
            } else {
              const err = await dealRes.json().catch(() => ({ error: "Unknown error" }));
              setAiMessages(prev => [...prev, { role: "assistant", content: `❌ Failed to create deal: ${err.error || dealRes.status}` }]);
            }
          }
        }
      } catch (e: any) {
        console.error("AI action parse error:", e);
      }
    } catch {
      setAiMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please check your network and try again." }]);
    } finally {
      setIsAiThinking(false);
    }
  }, [aiInput, aiMessages, isAiThinking, users, currentUser, currentWorkspace, fetchData]);

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
            // Welcome message
            setAiMessages([{
              role: "assistant",
              content: `Welcome back, ${user.name}! I'm EIDEN AI, your CRM assistant. I can help you manage tasks, analyze your pipeline, and keep your team on track.\n\nTry asking me:\n• "What tasks are overdue?"\n• "Give me a morning briefing"\n• "What deals are at risk?"\n• "Create a task to review the proposal for Sarah"`
            }]);
          }, 400);
        }
      }, 40);
    } catch {
      setLoginError("Connection failed. Please try again.");
    }
  };

  const handleRegister = async () => {
    setRegError(null);
    if (!regName || !regEmail || !regUsername || !regPassword || !regCompany || !regRole) {
      setRegError("All fields are required");
      return;
    }
    if (regPassword.length < 6) { setRegError("Password must be at least 6 characters"); return; }
    setIsRegistering(true);
    try {
      const res = await fetch("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: regName, email: regEmail, username: regUsername, password: regPassword, company_name: regCompany, role: regRole })
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

  const deleteTask = async (id: number) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
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
        due_date: fd.get("due_date"),
        priority: fd.get("priority"),
        related_deal_id: fd.get("related_deal_id") ? parseInt(fd.get("related_deal_id") as string) : null,
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
        due_date: editTask.due_date, priority: editTask.priority,
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

  // ─── Contact Actions ──────────────────────────────────────────────────────────
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
          <div style={{ position: "relative", zIndex: 10, fontFamily: "'JetBrains Mono', monospace", color: "var(--silk-creme)", letterSpacing: "-0.5px", fontWeight: 300, opacity: 0.7, fontSize: "0.8rem" }}>
            EIDEN // CRM_V.01
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
                    admin / admin123
                  </div>
                </div>
              </div>
            )}

            {view === "register" && (
              <div>
                {/* Step progress */}
                <div className="flex gap-1.5 mb-12">
                  {[0, 1, 2].map(i => (
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
                      <input type="email" placeholder="name@company.com" className="flash-input" value={regEmail}
                        onChange={e => { setRegEmail(e.target.value); setRegError(null); }} />
                    </AuthField>
                    <AuthField label="Company / Organization">
                      <input type="text" placeholder="Your company name" className="flash-input" value={regCompany}
                        onChange={e => { setRegCompany(e.target.value); setRegError(null); }} />
                      <p className="mt-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", color: "rgba(18,38,32,0.4)", lineHeight: 1.6 }}>
                        New company → you become Admin. Existing → join with your role.
                      </p>
                    </AuthField>
                    <AuthField label="Your Role">
                      <select className="flash-input" value={regRole} onChange={e => { setRegRole(e.target.value); setRegError(null); }}>
                        <option value="">Select your role...</option>
                        <option value="Operational Manager">Operational Manager</option>
                        <option value="Brand Manager">Brand Manager</option>
                        <option value="Web Developer">Web Developer</option>
                        <option value="Content Creator">Content Creator</option>
                        <option value="Solution Architect">Solution Architect</option>
                        <option value="Marketing Strategy">Marketing Strategy</option>
                        <option value="Sales">Sales</option>
                        <option value="Commercial">Commercial</option>
                      </select>
                    </AuthField>
                    {regError && <div className="px-4 py-3 text-[0.78rem]" style={{ border: "1px solid rgba(139,58,58,0.3)", color: "var(--danger)" }}>{regError}</div>}
                    <button onClick={() => { if (regName && regEmail && regCompany && regRole) { setRegError(null); setRegStep(1); } else setRegError("Fill in all fields"); }} className="flash-button mt-6">
                      <span>CONTINUE</span>
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </button>
                  </div>
                )}
                {regStep === 1 && (
                  <div className="space-y-8">
                    <div className="py-3" style={{ borderBottom: "1px solid rgba(18,38,32,0.1)" }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", color: "rgba(18,38,32,0.4)", textTransform: "uppercase", letterSpacing: "1px" }}>
                        {regCompany} · {regRole}
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
            <div className="w-7 h-7 flex items-center justify-center shrink-0 text-[0.72rem] font-bold" style={{ border: "1px solid rgba(244,235,208,0.35)", color: "var(--silk-creme)" }}>E</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase", color: "var(--silk-creme)", opacity: 0.8 }}>Eiden CRM</div>
          </div>
          <button className="lg:hidden p-1" style={{ color: "rgba(244,235,208,0.4)", background: "none", border: "none", cursor: "pointer" }} onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-6 flex flex-col gap-0 overflow-y-auto">
          <NavItem active={activeTab === "dashboard"} onClick={() => { setActiveTab("dashboard"); setSidebarOpen(false); }} icon={<ActivityIcon size={14} />} label="Dashboard" />
          {perms.tabs.includes("pipeline") && <NavItem active={activeTab === "pipeline"} onClick={() => { setActiveTab("pipeline"); setSidebarOpen(false); }} icon={<TrendingUp size={14} />} label="Pipeline" />}
          {perms.tabs.includes("contacts") && <NavItem active={activeTab === "contacts"} onClick={() => { setActiveTab("contacts"); setSidebarOpen(false); }} icon={<Users size={14} />} label="Contacts" />}
          <NavItem active={activeTab === "tasks"} onClick={() => { setActiveTab("tasks"); setSidebarOpen(false); }} icon={<CheckCircle2 size={14} />} label="Tasks" badge={overdueTasks.length > 0 ? overdueTasks.length : undefined} />
          {perms.tabs.includes("analytics") && <NavItem active={activeTab === "analytics"} onClick={() => { setActiveTab("analytics"); setSidebarOpen(false); }} icon={<BarChart2 size={14} />} label="Analytics" />}
          {perms.tabs.includes("codex") && <NavItem active={activeTab === "codex"} onClick={() => { setActiveTab("codex"); setSidebarOpen(false); }} icon={<BookOpen size={14} />} label="Codex" />}
          <div className="mx-6 my-3" style={{ height: 1, background: "rgba(244,235,208,0.06)" }} />
          <NavItem active={activeTab === "communications"} onClick={() => { setActiveTab("communications"); setChatUnread(0); setSidebarOpen(false); }} icon={<MessageSquare size={14} />} label="Team Chat" badge={chatUnread > 0 ? chatUnread : undefined} />
          {perms.tabs.includes("admin") && (
            <>
              <div className="mx-6 my-3" style={{ height: 1, background: "rgba(244,235,208,0.06)" }} />
              <NavItem active={activeTab === "admin"} onClick={() => { setActiveTab("admin"); setSidebarOpen(false); }} icon={<Shield size={14} />} label="Admin Panel" />
            </>
          )}
        </nav>

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
               : activeTab === "analytics" ? "Analytics"
               : activeTab === "codex" ? "Codex"
               : activeTab === "admin" ? "Admin"
               : "Team Chat"}
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
            {activeTab === "tasks" && <button onClick={() => { setSelectedDealForTask(null); setShowNewTaskModal(true); }} className="btn-primary text-[0.68rem] px-3 py-1.5">+ Task</button>}
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
                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 lg:gap-3 shrink-0">
                  <StatCard icon={<TrendingUp size={16} />} label="Pipeline Value" value={`$${(stats?.pipelineValue || 0).toLocaleString()}`} color="teal" />
                  <StatCard icon={<Target size={16} />} label="Active Deals" value={String(stats?.activeDeals ?? "—")} color="teal" />
                  <StatCard icon={<Zap size={16} />} label="Win Rate" value={stats?.winRate ?? "—"} color="success" />
                  <StatCard icon={<Users size={16} />} label="Active Clients" value={String(stats?.activeClients ?? "—")} color="teal" />
                  <StatCard icon={<AlertTriangle size={16} />} label="Overdue Tasks" value={String(stats?.overdueTasks ?? 0)} color={stats?.overdueTasks ? "danger" : "muted"} />
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
                        <button onClick={() => setAiMessages([])} className="btn-mini" style={{ fontSize: "0.6rem" }}>Clear</button>
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
                              <span className="ml-2 shrink-0 text-[0.65rem]">{t.due_date}</span>
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

                    {/* Recent activity */}
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
                      </div>
                    </div>

                    {/* Pipeline snapshot */}
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
                          {["Name","Company","Email","Phone","Status","Source","LTV"].map(h => (
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Tasks ────────────────────────────────────────── */}
            {activeTab === "tasks" && (
              <motion.div key="tasks" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col gap-4">
                <div className="shrink-0 grid grid-cols-4 gap-3">
                  <StatCard icon={<Clock size={15} />} label="Pending" value={String(filteredTasks.filter(t => t.status === "Pending").length)} color="warn" />
                  <StatCard icon={<Cpu size={15} />} label="In Progress" value={String(filteredTasks.filter(t => t.status === "In Progress").length)} color="teal" />
                  <StatCard icon={<CheckCircle2 size={15} />} label="Completed" value={String(filteredTasks.filter(t => t.status === "Completed").length)} color="success" />
                  <StatCard icon={<AlertTriangle size={15} />} label="Overdue" value={String(overdueTasks.length)} color={overdueTasks.length > 0 ? "danger" : "muted"} />
                </div>

                {/* AI quick task creation */}
                <div className="shrink-0 flex gap-3 items-center px-4 py-3" style={{ background: "var(--pure-white)", border: "1px solid rgba(18,38,32,0.1)", borderLeft: "1.5px solid var(--deep-forest)" }}>
                  <Bot size={14} className="shrink-0" style={{ color: "var(--deep-forest)" }} />
                  <form className="flex-1 flex gap-2" onSubmit={async e => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const input = String(fd.get("ai_task") || "").trim();
                    if (!input) return;
                    (e.currentTarget as HTMLFormElement).reset();
                    setActiveTab("dashboard");
                    await sendAiMessage(input);
                  }}>
                    <input name="ai_task" type="text" placeholder="Ask AI to create tasks… e.g. 'high priority task to review proposal for Sarah by Friday'"
                      className="flex-1 text-[0.8rem] outline-none"
                      style={{ border: "none", borderBottom: "1.5px solid rgba(18,38,32,0.15)", padding: "7px 0", fontFamily: "'Space Grotesk',sans-serif", color: "var(--deep-forest)", background: "transparent" }} />
                    <button type="submit" className="btn-primary">Ask AI</button>
                  </form>
                </div>

                <div className="flex-1 eiden-card overflow-hidden flex flex-col min-h-0">
                  <div className="shrink-0 px-5 py-3" style={{ borderBottom: "1px solid rgba(18,38,32,0.07)", background: "rgba(18,38,32,0.03)" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>All Tasks — {filteredTasks.length} total</span>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-left min-w-[700px]">
                      <thead className="sticky top-0" style={{ background: "rgba(18,38,32,0.04)" }}>
                        <tr style={{ borderBottom: "1px solid rgba(18,38,32,0.07)" }}>
                          {["Task","Assignee","Deal","Due Date","Priority","Status","Actions"].map(h => (
                            <th key={h} className="py-2.5 px-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.35)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTasks.map(task => {
                          const overdue = isOverdue(task.due_date, task.status);
                          return (
                            <tr key={task.id} className="text-[0.78rem] transition-colors"
                              style={{ borderBottom: "1px solid rgba(18,38,32,0.05)", background: overdue ? "rgba(139,58,58,0.03)" : "" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "rgba(18,38,32,0.025)")}
                              onMouseLeave={e => (e.currentTarget.style.background = overdue ? "rgba(139,58,58,0.03)" : "")}>
                              <td className="py-3 px-4">
                                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--deep-forest)" }}>{task.title}</div>
                                {task.description && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", marginTop: 2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(18,38,32,0.38)" }}>{task.description}</div>}
                              </td>
                              <td className="py-3 px-4" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.5)" }}>{task.assignee_name || "Unassigned"}</td>
                              <td className="py-3 px-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", color: "rgba(18,38,32,0.4)" }}>{task.deal_title || "—"}</td>
                              <td className="py-3 px-4">
                                <span className="font-medium" style={{ color: overdue ? "var(--danger)" : "var(--gris)" }}>
                                  {task.due_date || "—"}{overdue && " ⚠"}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-0.5 text-[0.6rem] font-bold uppercase border ${priorityColor(task.priority)}`}>{task.priority}</span>
                              </td>
                              <td className="py-3 px-4">
                                <select value={task.status} onChange={e => updateTaskStatus(task.id, e.target.value)}
                                  className="text-[0.72rem] outline-none cursor-pointer"
                                  style={{ border: "none", borderBottom: "1px solid rgba(18,38,32,0.15)", padding: "4px 0", fontFamily: "'Space Grotesk',sans-serif", color: "var(--deep-forest)", background: "transparent" }}>
                                  <option>Pending</option>
                                  <option>In Progress</option>
                                  <option>Completed</option>
                                </select>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex gap-2">
                                  <button onClick={() => { setEditTask({ ...task }); setShowEditTaskModal(true); }} style={{ color: "var(--deep-forest)" }} className="hover:opacity-70 transition-opacity"><Edit3 size={13} /></button>
                                  {perms.canDelete && <button onClick={() => deleteTask(task.id)} style={{ color: "var(--gris)" }} className="hover:text-[var(--danger)] transition-colors"><Trash2 size={13} /></button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Analytics ────────────────────────────────────── */}
            {activeTab === "analytics" && (
              <motion.div key="analytics" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
                  {/* Revenue */}
                  <div className="eiden-card p-6">
                    <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Revenue Overview</div>
                    <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Won vs Pending revenue</div>
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

                  {/* Pipeline distribution */}
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

                  {/* Team workload */}
                  <div className="eiden-card p-6">
                    <div className="mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(18,38,32,0.45)" }}>Team Workload</div>
                    <div className="mb-5" style={{ fontSize: "0.75rem", color: "rgba(18,38,32,0.38)", fontWeight: 300 }}>Tasks per team member</div>
                    <div className="space-y-3">
                      {users.map(u => {
                        const userTasks = tasks.filter(t => t.assignee_id === u.id);
                        const pending = userTasks.filter(t => t.status === "Pending").length;
                        const inProgress = userTasks.filter(t => t.status === "In Progress").length;
                        const completed = userTasks.filter(t => t.status === "Completed").length;
                        const overdue = userTasks.filter(t => isOverdue(t.due_date, t.status)).length;
                        return (
                          <div key={u.id} className="p-3" style={{ border: "1px solid rgba(18,38,32,0.08)", borderLeft: "1.5px solid var(--deep-forest)" }}>
                            <div className="flex justify-between mb-1.5">
                              <div>
                                <div className="font-semibold text-[0.82rem]" style={{ color: "var(--deep-forest)" }}>{u.name}</div>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.35)" }}>{u.role}</div>
                              </div>
                              {overdue > 0 && (
                                <span className="text-[0.65rem] font-bold flex items-center gap-1" style={{ color: "var(--danger)" }}>
                                  <AlertTriangle size={10} /> {overdue} overdue
                                </span>
                              )}
                            </div>
                            <div className="flex gap-3 text-[0.68rem] font-semibold">
                              <span style={{ color: "var(--warning)" }}>{pending} pending</span>
                              <span style={{ color: "var(--deep-forest)" }}>{inProgress} active</span>
                              <span style={{ color: "var(--success)" }}>{completed} done</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Risk overview */}
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
            )}

            {/* ── Codex ────────────────────────────────────────── */}
            {activeTab === "codex" && (
              <motion.div key="codex" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                  {knowledge.map(item => (
                    <div key={item.id} className="eiden-card p-5 space-y-3 group cursor-pointer" onClick={() => { setSelectedKnowledge(item); setShowKnowledgeModal(true); }}>
                      <div className="flex items-start justify-between gap-3">
                        <h3 style={{ fontSize: "0.9rem", fontWeight: 700, lineHeight: 1.3, color: "var(--deep-forest)" }}>{item.title}</h3>
                        <span className="shrink-0 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.06em]" style={{ border: "1px solid rgba(18,38,32,0.12)", color: "var(--deep-forest)", background: "rgba(18,38,32,0.04)" }}>{item.category}</span>
                      </div>
                      <p className="text-[0.75rem] leading-relaxed line-clamp-4" style={{ color: "var(--gris)" }}>{item.content}</p>
                      <div className="flex justify-between items-center pt-3" style={{ borderTop: "1px dashed rgba(18,38,32,0.1)" }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.3)" }}>KB-{item.id.toString().padStart(3, "0")}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 500, color: "var(--deep-forest)", display: "flex", alignItems: "center", gap: 4 }}>Read →</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Communications ───────────────────────────────── */}
            {activeTab === "communications" && (
              <motion.div key="communications" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col gap-4">

                {/* ── Zoom panel ── */}
                <div className="shrink-0 eiden-card">
                  {/* Header row */}
                  <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: zoomConnected ? "1px solid rgba(18,38,32,0.06)" : "none" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 flex items-center justify-center text-[0.6rem] font-bold" style={{ background: "#2D8CFF", color: "#fff" }}>Z</div>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px", color: "var(--deep-forest)" }}>Zoom</span>
                      {zoomConnected && (
                        <span className="flex items-center gap-1 px-2 py-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "var(--success)", border: "1px solid rgba(45,90,71,0.25)" }}>
                          ✓ {zoomEmail}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {zoomConnected ? (
                        <>
                          <button onClick={() => setShowScheduleModal(true)} className="btn-primary" style={{ fontSize: "0.68rem", padding: "6px 14px" }}>+ Schedule Meeting</button>
                          <button onClick={disconnectZoom} className="btn-mini danger" style={{ fontSize: "0.6rem" }}>Disconnect</button>
                        </>
                      ) : (
                        <a href={`/api/zoom/auth?workspace_id=${currentWorkspace?.id}`}
                          className="btn-primary" style={{ fontSize: "0.68rem", padding: "6px 14px", textDecoration: "none" }}>
                          Connect Zoom
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Meeting list */}
                  {zoomConnected && zoomMeetings.length > 0 && (
                    <div className="px-5 py-3 flex flex-col gap-2">
                      {zoomMeetings.map(m => (
                        <div key={m.id} className="flex items-center justify-between gap-4 py-2" style={{ borderBottom: "1px dashed rgba(18,38,32,0.08)" }}>
                          <div className="flex flex-col gap-0.5">
                            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--deep-forest)" }}>{m.topic}</span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.4)" }}>
                              {new Date(m.start_time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {m.duration} min
                            </span>
                          </div>
                          <a href={m.join_url} target="_blank" rel="noreferrer" className="btn-mini shrink-0" style={{ borderColor: "#2D8CFF", color: "#2D8CFF" }}>
                            Join
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                  {zoomConnected && zoomMeetings.length === 0 && (
                    <div className="px-5 py-3" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "rgba(18,38,32,0.35)" }}>No upcoming meetings — schedule one above.</div>
                  )}
                </div>

                {/* Meeting bar */}
                <div className="shrink-0 flex gap-3 items-center px-5 py-3 eiden-card">
                  <Bell size={13} style={{ color: "rgba(18,38,32,0.4)" }} className="shrink-0" />
                  <input value={meetingLink} onChange={e => setMeetingLink(e.target.value)}
                    className="flex-1 outline-none text-[0.8rem]"
                    style={{ border: "none", borderBottom: "1.5px solid rgba(18,38,32,0.15)", padding: "7px 0", fontFamily: "'Space Grotesk',sans-serif", color: "var(--deep-forest)", background: "transparent" }}
                    placeholder="Quick meeting URL or ID" />
                  {meetingLink.trim() && (
                    <a href={meetingLink.startsWith("http") ? meetingLink : `https://zoom.us/j/${meetingLink}`}
                      target="_blank" rel="noreferrer" className="btn-mini whitespace-nowrap">
                      Open
                    </a>
                  )}
                  <button onClick={saveMeetingLink} disabled={isMeetingSaving} className="btn-primary" style={{ opacity: isMeetingSaving ? 0.5 : 1 }}>
                    {isMeetingSaving ? "Saving…" : "Save"}
                  </button>
                </div>

                {/* Chat panel */}
                <div className="flex-1 flex flex-col overflow-hidden eiden-card" style={{ position: "relative" }}>
                  {/* Header */}
                  <div className="shrink-0 px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(18,38,32,0.07)", background: "var(--deep-forest)" }}>
                    <div className="flex items-center gap-2">
                      <MessageSquare size={13} style={{ color: "rgba(244,235,208,0.6)" }} />
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(244,235,208,0.7)" }}>Team Chat</span>
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "rgba(244,235,208,0.3)", letterSpacing: "1px" }}>
                      {currentWorkspace?.name}
                    </span>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {chatMessages.length === 0 && (
                      <div className="text-center py-12">
                        <div className="w-12 h-12 flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(18,38,32,0.04)", border: "1px solid rgba(18,38,32,0.08)" }}>
                          <MessageSquare size={20} style={{ color: "rgba(18,38,32,0.25)" }} />
                        </div>
                        <p style={{ fontSize: "0.78rem", color: "rgba(18,38,32,0.4)", fontFamily: "'JetBrains Mono', monospace" }}>No messages yet — start the conversation.</p>
                      </div>
                    )}
                    {chatMessages.map(msg => {
                      const isMe = msg.user === currentUser?.name;
                      return (
                        <div key={msg.id} className={`flex gap-3 ${isMe ? "justify-end" : "justify-start"}`}>
                          {!isMe && (
                            <div className="shrink-0 w-8 h-8 flex items-center justify-center mt-0.5 text-[0.7rem] font-bold"
                              style={{ background: "var(--deep-forest)", color: "var(--silk-creme)" }}>
                              {msg.user[0].toUpperCase()}
                            </div>
                          )}
                          <div className="max-w-[68%] flex flex-col gap-1">
                            {!isMe && (
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "rgba(18,38,32,0.45)", marginLeft: 4 }}>{msg.user}</span>
                            )}
                            <div className="px-4 py-2.5 text-[0.78rem] leading-relaxed"
                              style={isMe
                                ? { background: "var(--deep-forest)", color: "var(--silk-creme)" }
                                : { background: "var(--pure-white)", color: "var(--deep-forest)", border: "1px solid rgba(18,38,32,0.08)" }}>
                              {msg.text}
                            </div>
                            <span className={`text-[0.58rem] px-1 ${isMe ? "text-right" : "text-left"}`} style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(18,38,32,0.3)" }}>
                              {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                            </span>
                          </div>
                          {isMe && (
                            <div className="shrink-0 w-8 h-8 flex items-center justify-center mt-0.5 text-[0.7rem] font-bold"
                              style={{ background: "rgba(18,38,32,0.08)", color: "var(--deep-forest)" }}>
                              {(currentUser?.name ?? "M")[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input */}
                  <div className="shrink-0 flex gap-3 px-5 py-3" style={{ borderTop: "1px solid rgba(18,38,32,0.07)" }}>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && sendChatMessage()}
                      placeholder={`Message ${currentWorkspace?.name}…`}
                      className="flex-1 outline-none text-[0.82rem]"
                      style={{ border: "none", borderBottom: "1.5px solid rgba(18,38,32,0.15)", padding: "8px 0", fontFamily: "'Space Grotesk', sans-serif", color: "var(--deep-forest)", background: "transparent" }} />
                    <button onClick={sendChatMessage}
                      className="flex items-center justify-center transition-opacity hover:opacity-80"
                      style={{ background: "var(--deep-forest)", color: "var(--silk-creme)", width: 40, height: 40, flexShrink: 0, border: "none", cursor: "pointer" }}>
                      <Send size={14} />
                    </button>
                  </div>
                </div>
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
                                <select value={u.role} onChange={async e => {
                                  await fetch(`/api/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: e.target.value }) });
                                  fetchAdminData();
                                }} className="text-[0.7rem] outline-none px-2 py-1 font-semibold"
                                  style={{ border: "none", borderBottom: "1px solid rgba(18,38,32,0.15)", background: "transparent", color: "var(--deep-forest)", fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer" }}>
                                  {["Admin", "Operational Manager", "Brand Manager", "Marketing Strategy", "Web / IT Developer", "Commercial"].map(r => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
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
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
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
                <Field label="Due Date"><input name="due_date" type="date" required className="field-input" /></Field>
                <Field label="Related Deal">
                  <select name="related_deal_id" defaultValue={selectedDealForTask?.id || ""} className="field-input">
                    <option value="">None</option>
                    {deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </select>
                </Field>
              </div>
              <button type="submit" className="flash-button mb-0">Create Task</button>
            </form>
          </Modal>
        )}

        {/* Edit Task */}
        {showEditTaskModal && editTask && (
          <Modal title="Edit Task" onClose={() => { setShowEditTaskModal(false); setEditTask(null); }}>
            <div className="space-y-4">
              <Field label="Title"><input value={editTask.title} onChange={e => setEditTask({ ...editTask, title: e.target.value })} className="field-input" /></Field>
              <Field label="Description"><textarea value={editTask.description || ""} onChange={e => setEditTask({ ...editTask, description: e.target.value })} className="field-input resize-none h-16" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Due Date"><input type="date" value={editTask.due_date} onChange={e => setEditTask({ ...editTask, due_date: e.target.value })} className="field-input" /></Field>
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
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <button onClick={handleUpdateTask} className="flash-button mb-0">Save Changes</button>
            </div>
          </Modal>
        )}

        {/* Knowledge detail */}
        {showKnowledgeModal && selectedKnowledge && (
          <Modal title={selectedKnowledge.title} onClose={() => { setShowKnowledgeModal(false); setSelectedKnowledge(null); }}>
            <div className="space-y-4">
              <span className="inline-block px-2 py-0.5 text-[0.6rem] font-bold uppercase" style={{ border: "1px solid rgba(18,38,32,0.12)", color: "var(--deep-forest)", background: "rgba(18,38,32,0.04)" }}>{selectedKnowledge.category}</span>
              <div className="p-4 text-[0.8rem] leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto" style={{ background: "var(--silk-creme)", border: "1px solid rgba(18,38,32,0.1)", color: "var(--deep-forest)" }}>
                {selectedKnowledge.content}
              </div>
              <button onClick={() => { setShowKnowledgeModal(false); setSelectedKnowledge(null); }} className="flash-button" style={{ marginBottom: 0 }}>Close</button>
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

      {/* Chat notification toast */}
      <AnimatePresence>
        {chatToast && (
          <motion.div
            initial={{ opacity: 0, y: 40, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 40, x: "-50%" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            onClick={() => { setActiveTab("communications"); setChatUnread(0); setChatToast(null); }}
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
function NavItem({ active, onClick, icon, label, badge }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number;
}) {
  return (
    <button onClick={onClick} className={`nav-item-eiden ${active ? "active" : ""}`}>
      <span className="shrink-0 opacity-70">{icon}</span>
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto shrink-0 w-4 h-4 flex items-center justify-center text-[8px] font-bold" style={{ background: "var(--danger)", color: "var(--pure-white)" }}>{badge}</span>
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
