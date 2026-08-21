import React, { useState, useMemo, useEffect, createContext, useContext, useRef } from "react";
import {
  LayoutDashboard, ListChecks, Users, BarChart3, Search, Bell, Sun, Moon, Plus, X,
  Check, Clock, AlertTriangle, MessageSquare, RotateCcw, Calendar, CheckCircle2,
  ChevronDown, Download, Building2, Menu, CornerDownRight, Flag, TrendingUp, Send, Activity,
  ArrowLeft, UploadCloud, FileText, Trash2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid,
} from "recharts";

/* ------------------------------------------------------------------ theme */
const ACCENT = "#0EA5E9"; // light blue (sky) — the brand note across a white UI
const rgba = (hex, a) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const THEMES = {
  light: {
    canvas: "#EAF3FB", surface: "#FFFFFF", surfaceAlt: "#F2F8FD", text: "#0F2A45",
    muted: "#5A6E82", faint: "#93A6BC", border: "#DCE9F4", ring: rgba(ACCENT, 0.35),
    sidebar: "#FFFFFF", sideBorder: "#E2ECF6", sideText: "#33506B", sideMuted: "#96A9BE",
    sideActive: rgba(ACCENT, 0.12), sideActiveText: "#0B7BB0", sideHover: "#EEF6FD", sideCard: "#EAF4FC",
    shadow: "0 1px 2px rgba(15,42,69,.06), 0 8px 24px rgba(37,120,190,.08)",
  },
  dark: {
    canvas: "#0A1220", surface: "#111C2E", surfaceAlt: "#172438", text: "#E6EFF8",
    muted: "#93A6BC", faint: "#647689", border: "#22334A", ring: rgba(ACCENT, 0.5),
    sidebar: "#0B1524", sideBorder: "#1B2C42", sideText: "#C6D5E5", sideMuted: "#6E8299",
    sideActive: rgba(ACCENT, 0.22), sideActiveText: "#7FD1F5", sideHover: "rgba(255,255,255,.05)", sideCard: "rgba(255,255,255,.05)",
    shadow: "0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.35)",
  },
};
const Ctx = createContext(null);
const useT = () => useContext(Ctx);

/* -------------------------------------------------------------- constants */
const PRIORITY = {
  high: { label: "High", color: "#E11D48" },
  medium: { label: "Medium", color: "#D97706" },
  low: { label: "Low", color: "#0D9488" },
};
const STATUS = {
  todo: { label: "To Do", color: "#64748B" },
  in_progress: { label: "In Progress", color: "#2563EB" },
  blocked: { label: "Blocked", color: "#E11D48" },
  done: { label: "Done", color: "#059669" },
  reopened: { label: "Reopened", color: "#7C3AED" },
};
const STATUS_ORDER = ["todo", "in_progress", "blocked", "reopened", "done"];
const OPEN_STATUSES = ["todo", "in_progress", "blocked", "reopened"];

const MEMBERS = [
  { id: "u1", name: "Maya Iris", role: "manager", initials: "MI", color: "#4F46E5" },
  { id: "u2", name: "Devon Park", role: "user", initials: "DP", color: "#0D9488" },
  { id: "u3", name: "Sana Okoro", role: "user", initials: "SO", color: "#DB2777" },
  { id: "u4", name: "Leo Ahmadi", role: "user", initials: "LA", color: "#D97706" },
  { id: "u5", name: "Admin", role: "admin", initials: "AD", color: "#475569" },
];
const CLIENTS = [
  { id: "c1", name: "Acme Corp" },
  { id: "c2", name: "Globex" },
  { id: "c3", name: "Initech" },
  { id: "c4", name: "Umbrella" },
];
const TODAY = new Date("2026-08-19T00:00:00");
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => iso(new Date(TODAY.getTime() + n * 864e5));

let TID = 120;
const nid = () => `TASK-${++TID}`;
const mk = (o) => ({
  id: nid(), type: "feature", subtasks: [], comments: [], files: [], activity: [], hours: 0,
  createdAt: addDays(-14), ...o,
});

const SEED = [
  mk({ title: "Email-to-task automation pipeline", clientId: "c1", assignee: "u2", priority: "high", status: "in_progress", due: addDays(3), ref: "PROJ-007", version: "V1", hours: 6.5,
    subtasks: [{ id: "s1", title: "Inbound webhook + signature check", done: true }, { id: "s2", title: "Sender → user matching", done: true }, { id: "s3", title: "Attachment handling", done: false }],
    comments: [{ id: "m1", author: "u1", body: "Let's dedupe by Message-ID before creating tasks.", at: "2d ago" }],
    description: "Automatically create a task from an incoming email. Verify signature, dedupe, then map subject→title and body→description." }),
  mk({ title: "Role-based access control (Admin / Manager / User)", clientId: "c1", assignee: "u4", priority: "high", status: "in_progress", due: addDays(5), ref: "PROJ-017", version: "V1", hours: 4,
    subtasks: [{ id: "s1", title: "Route guards", done: true }, { id: "s2", title: "Record-level policies", done: false }],
    description: "Enforce permissions at the route and record level. Members can request reopens; managers approve." }),
  mk({ title: "Manager dashboard overview", clientId: "c2", assignee: "u1", priority: "high", status: "in_progress", due: addDays(1), ref: "PROJ-009", version: "V1", hours: 5,
    description: "Cards for open, overdue, on-time rate and workload by member, plus recent activity." }),
  mk({ title: "Task creation, assignment & dependencies", clientId: "c2", assignee: "u3", priority: "high", status: "done", due: addDays(-2), ref: "PROJ-010", version: "V1", hours: 9,
    description: "Core task CRUD with priorities, due dates and dependency links." }),
  mk({ title: "Notification timing configuration", clientId: "c3", assignee: "u4", priority: "medium", status: "todo", due: addDays(8), ref: "PROJ-002", version: "V1",
    description: "Managers set when reminders fire for pending tasks and approaching deadlines." }),
  mk({ title: "Client-scoped task lists", clientId: "c1", assignee: "u2", priority: "medium", status: "done", due: addDays(-4), ref: "PROJ-003", version: "V1", hours: 3.5,
    description: "List and filter tasks by the client they belong to." }),
  mk({ title: "Reopen flow + member requests", clientId: "c3", assignee: "u3", priority: "medium", status: "blocked", due: addDays(-1), ref: "PROJ-004", version: "V1", hours: 2,
    comments: [{ id: "m1", author: "u3", body: "Blocked on the audit-log schema.", at: "1d ago" }],
    description: "A closed task can be reopened by a manager; a member can request a reopen with a reason." }),
  mk({ title: "Sub-tasks", clientId: "c4", assignee: "u2", priority: "medium", status: "in_progress", due: addDays(6), ref: "PROJ-006", version: "V1", hours: 3,
    subtasks: [{ id: "s1", title: "Nested task model", done: true }, { id: "s2", title: "Progress rollup", done: false }],
    description: "Break a task into sub-tasks so individuals own specific parts." }),
  mk({ title: "Time tracking (manual + auto)", clientId: "c2", assignee: "u4", priority: "medium", status: "todo", due: addDays(10), ref: "PROJ-012", version: "V1",
    description: "Track time per task and status; auto-start on In Progress, auto-stop on Done." }),
  mk({ title: "Status, comments & attachments", clientId: "c1", assignee: "u3", priority: "medium", status: "done", due: addDays(-6), ref: "PROJ-013", version: "V1", hours: 7,
    description: "Status, blockers, notifications, comments and attachments on every task." }),
  mk({ title: "Productivity & task reports", clientId: "c4", assignee: "u1", priority: "medium", status: "todo", due: addDays(12), ref: "PROJ-014", version: "V1",
    description: "Completed count, on-time rate and time-per-task, per member." }),
  mk({ title: "Slack / GitHub / Calendar integrations", clientId: "c2", assignee: "u2", priority: "medium", status: "todo", due: addDays(14), ref: "PROJ-016", version: "V1",
    description: "Connect Slack, GitHub and Calendar via signed webhooks." }),
  mk({ title: "In-app chat", clientId: "c3", assignee: "u4", priority: "low", status: "todo", due: addDays(16), ref: "PROJ-018", version: "V1",
    description: "Team channels and direct messages over WebSockets." }),
  mk({ title: "Dark / light theme toggle", clientId: "c1", assignee: "u3", priority: "low", status: "done", due: addDays(-9), ref: "PROJ-019", version: "V1", hours: 2,
    description: "Theme toggle following the system preference, overridable per user." }),
  mk({ title: "Meeting notes → tasks (with confirmation)", clientId: "c4", assignee: "u1", priority: "medium", status: "reopened", due: addDays(2), ref: "PROJ-001", version: "V1", hours: 4,
    comments: [{ id: "m1", author: "u1", body: "Reopened — confirmation step was skipping owners.", at: "4h ago" }],
    description: "Turn meeting notes into draft tasks, pending manager/employee confirmation." }),
  mk({ title: "Calendar view of tasks & deadlines", clientId: "c2", assignee: "u2", priority: "medium", status: "todo", due: addDays(21), ref: "PROJ-021", version: "V2", type: "improvement",
    description: "A calendar surface for tasks and due dates (V2)." }),
  mk({ title: "Recurring tasks & reusable templates", clientId: "c3", assignee: "u4", priority: "medium", status: "todo", due: addDays(24), ref: "PROJ-022", version: "V2", type: "improvement",
    description: "Reusable task templates and recurrence rules (V2)." }),
  mk({ title: "Dashboard customization", clientId: "c1", assignee: "u3", priority: "medium", status: "todo", due: addDays(28), ref: "PROJ-020", version: "V2", type: "improvement",
    description: "Let each user rearrange their dashboard cards (V2)." }),
];

/* --------------------------------------------------------------- helpers */
const memberOf = (id) => MEMBERS.find((m) => m.id === id);
const clientOf = (id) => CLIENTS.find((c) => c.id === id);
const isOverdue = (t) => t.status !== "done" && new Date(t.due) < TODAY;
const fmtDue = (d) => {
  const dt = new Date(d);
  const days = Math.round((dt - TODAY) / 864e5);
  const label = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (days === 0) return { label: "Today", warn: true };
  if (days < 0) return { label: `${label}`, warn: true };
  return { label, warn: false };
};
const uid = () => Math.random().toString(36).slice(2, 9);
const fmtSize = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const mkUpdate = (body, color) => ({ id: uid(), kind: "update", author: "u1", body, color, at: "just now" });
const mkComment = (body) => ({ id: uid(), kind: "comment", author: "u1", body, at: "just now" });
const readFiles = (fileList) =>
  Promise.all([...fileList].map((f) => new Promise((res) => {
    if (f.type && f.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = () => res({ id: uid(), name: f.name, size: f.size, kind: "image", url: r.result });
      r.onerror = () => res({ id: uid(), name: f.name, size: f.size, kind: "file", mime: f.type });
      r.readAsDataURL(f);
    } else {
      res({ id: uid(), name: f.name, size: f.size, kind: "file", mime: f.type });
    }
  })));

/* ---------------------------------------------------------- atoms */
function Avatar({ id, size = 26 }) {
  const m = memberOf(id);
  if (!m) return null;
  return (
    <span title={m.name} style={{
      width: size, height: size, background: m.color, color: "#fff", borderRadius: 999,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.4, fontWeight: 600, flexShrink: 0,
    }}>{m.initials}</span>
  );
}

function Pill({ color, children, dot = true }) {
  return (
    <span style={{
      color, background: rgba(color, 0.13), borderRadius: 999, padding: "2px 9px",
      fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />}
      {children}
    </span>
  );
}

function Card({ children, style, pad = 16, className = "" }) {
  const t = useT();
  return (
    <div className={className} style={{
      background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14,
      boxShadow: t.shadow, padding: pad, ...style,
    }}>{children}</div>
  );
}

function Btn({ children, onClick, variant = "ghost", size = "md", icon: Icon, style, title, disabled }) {
  const t = useT();
  const pad = size === "sm" ? "6px 10px" : "9px 14px";
  const base = {
    display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 10, padding: pad,
    fontSize: 13.5, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, transition: "filter .15s, background .15s", border: "1px solid transparent",
    whiteSpace: "nowrap", ...style,
  };
  const variants = {
    primary: { background: ACCENT, color: "#fff" },
    solid: { background: t.text, color: t.canvas },
    outline: { background: "transparent", color: t.text, borderColor: t.border },
    ghost: { background: "transparent", color: t.muted },
    subtle: { background: t.surfaceAlt, color: t.text, borderColor: t.border },
  };
  return (
    <button title={title} disabled={disabled} onClick={onClick}
      onMouseDown={(e) => e.currentTarget.blur()}
      style={{ ...base, ...variants[variant] }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.filter = "brightness(0.96)")}
      onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}>
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

function Field({ label, children }) {
  const t = useT();
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: t.muted, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}
function inputStyle(t) {
  return {
    width: "100%", background: t.surfaceAlt, border: `1px solid ${t.border}`, color: t.text,
    borderRadius: 10, padding: "9px 11px", fontSize: 13.5, outline: "none", boxSizing: "border-box",
  };
}

/* ---------------------------------------------------------- sidebar */
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "clients", label: "Clients", icon: Building2 },
  { id: "reports", label: "Reports", icon: BarChart3 },
];
function Sidebar({ view, setView, open, close }) {
  const t = useT();
  const content = (
    <div style={{ background: t.sidebar, width: 230, height: "100%", padding: 18, display: "flex", flexDirection: "column", flexShrink: 0, borderRight: `1px solid ${t.sideBorder}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 20px" }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: ACCENT, display: "grid", placeItems: "center", color: "#fff" }}><Activity size={18} /></div>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
          <span style={{ color: t.sideText, fontWeight: 700, letterSpacing: -0.3, fontSize: 16.5 }}>Madre Pulse</span>
          <span style={{ color: t.sideMuted, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, fontFamily: "ui-monospace, monospace" }}>TASK OPS</span>
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.sideMuted, letterSpacing: 0.6, padding: "6px 8px", fontFamily: "ui-monospace, monospace" }}>WORKSPACE</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
        {NAV.map((n) => {
          const active = view === n.id;
          return (
            <button key={n.id} onClick={() => { setView(n.id); close(); }}
              style={{
                display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 10,
                border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, textAlign: "left",
                color: active ? t.sideActiveText : t.sideText,
                background: active ? t.sideActive : "transparent",
              }}
              onMouseEnter={(e) => !active && (e.currentTarget.style.background = t.sideHover)}
              onMouseLeave={(e) => !active && (e.currentTarget.style.background = "transparent")}>
              <n.icon size={17} /> {n.label}
            </button>
          );
        })}
      </nav>
      <div style={{ marginTop: "auto", padding: 12, borderRadius: 12, background: t.sideCard }}>
        <div style={{ fontSize: 12.5, color: t.sideText, fontWeight: 600 }}>Prototype</div>
        <div style={{ fontSize: 11.5, color: t.sideMuted, marginTop: 3, lineHeight: 1.4 }}>
          Sample data, in-memory. Explore freely.
        </div>
      </div>
    </div>
  );
  return (
    <>
      <div className="tf-desktop-only" style={{ height: "100%" }}>{content}</div>
      {open && (
        <div className="tf-mobile-only" style={{ position: "fixed", inset: 0, zIndex: 60 }}>
          <div onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)" }} />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0 }}>{content}</div>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------- topbar */
function Topbar({ view, query, setQuery, dark, setDark, role, setRole, notifs, onOpenMenu }) {
  const t = useT();
  const [nOpen, setNOpen] = useState(false);
  const [rOpen, setROpen] = useState(false);
  const title = NAV.find((n) => n.id === view)?.label || "";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
      borderBottom: `1px solid ${t.border}`, background: t.surface, position: "sticky", top: 0, zIndex: 40,
    }}>
      <button className="tf-mobile-only" onClick={onOpenMenu} style={{ border: "none", background: "transparent", color: t.text, cursor: "pointer" }}><Menu size={20} /></button>
      <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: -0.3, color: t.text }}>{title}</div>

      <div className="tf-search" style={{
        marginLeft: 12, flex: 1, maxWidth: 420, display: "flex", alignItems: "center", gap: 8,
        background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 11px",
      }}>
        <Search size={16} color={t.faint} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks…"
          style={{ border: "none", background: "transparent", outline: "none", color: t.text, fontSize: 13.5, width: "100%" }} />
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {/* role switcher */}
        <div style={{ position: "relative" }}>
          <button onClick={() => { setROpen(!rOpen); setNOpen(false); }} style={{
            display: "flex", alignItems: "center", gap: 7, background: t.surfaceAlt, border: `1px solid ${t.border}`,
            color: t.text, borderRadius: 10, padding: "7px 10px", cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: ACCENT }} />
            {role[0].toUpperCase() + role.slice(1)}
            <ChevronDown size={14} color={t.muted} />
          </button>
          {rOpen && (
            <Menu2 onClose={() => setROpen(false)} t={t}>
              <div style={{ padding: "6px 10px", fontSize: 11, color: t.faint, fontWeight: 700 }}>VIEW AS ROLE</div>
              {["admin", "manager", "user"].map((r) => (
                <button key={r} onClick={() => { setRole(r); setROpen(false); }} style={menuItem(t, role === r)}>
                  {r[0].toUpperCase() + r.slice(1)}
                  {role === r && <Check size={15} />}
                </button>
              ))}
              <div style={{ padding: "8px 10px 4px", fontSize: 11, color: t.faint, lineHeight: 1.4 }}>
                Reopen is manager-only; users can request one.
              </div>
            </Menu2>
          )}
        </div>

        {/* notifications */}
        <div style={{ position: "relative" }}>
          <button onClick={() => { setNOpen(!nOpen); setROpen(false); }} style={iconBtn(t)}>
            <Bell size={18} />
            {notifs.length > 0 && <span style={{
              position: "absolute", top: 4, right: 4, minWidth: 15, height: 15, padding: "0 3px", borderRadius: 999,
              background: "#E11D48", color: "#fff", fontSize: 9.5, fontWeight: 700, display: "grid", placeItems: "center",
            }}>{notifs.length}</span>}
          </button>
          {nOpen && (
            <Menu2 onClose={() => setNOpen(false)} t={t} w={300}>
              <div style={{ padding: "8px 12px", fontWeight: 700, fontSize: 13, color: t.text }}>Notifications</div>
              {notifs.map((n) => (
                <div key={n.id} style={{ padding: "9px 12px", display: "flex", gap: 10, borderTop: `1px solid ${t.border}` }}>
                  <n.icon size={16} color={n.color} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, color: t.text, lineHeight: 1.35 }}>{n.text}</div>
                    <div style={{ fontSize: 11, color: t.faint, marginTop: 2, fontFamily: "ui-monospace, monospace" }}>{n.at}</div>
                  </div>
                </div>
              ))}
            </Menu2>
          )}
        </div>

        <button onClick={() => setDark(!dark)} style={iconBtn(t)} title="Toggle theme">
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="tf-desktop-only"><Avatar id="u1" size={30} /></div>
      </div>
    </div>
  );
}
const iconBtn = (t) => ({
  position: "relative", width: 38, height: 38, borderRadius: 10, border: `1px solid ${t.border}`,
  background: t.surfaceAlt, color: t.text, cursor: "pointer", display: "grid", placeItems: "center",
});
const menuItem = (t, active) => ({
  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
  padding: "8px 10px", border: "none", background: active ? t.surfaceAlt : "transparent",
  color: t.text, cursor: "pointer", fontSize: 13, fontWeight: 500, textAlign: "left", borderRadius: 8,
});
function Menu2({ children, onClose, t, w = 190 }) {
  const ref = useRef();
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position: "absolute", right: 0, top: "calc(100% + 8px)", width: w, background: t.surface,
      border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.shadow, padding: 6, zIndex: 50,
    }}>{children}</div>
  );
}

/* ---------------------------------------------------------- dashboard */
function Metric({ label, value, sub, icon: Icon, tone }) {
  const t = useT();
  return (
    <Card pad={16} style={{ minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 12.5, color: t.muted, fontWeight: 600 }}>{label}</div>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: rgba(tone, 0.13), display: "grid", placeItems: "center" }}>
          <Icon size={16} color={tone} />
        </div>
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: t.text, letterSpacing: -1, marginTop: 8, fontFamily: "ui-monospace, monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: t.faint, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}
function Dashboard({ tasks, activity, go }) {
  const t = useT();
  const m = useMemo(() => {
    const open = tasks.filter((x) => OPEN_STATUSES.includes(x.status));
    const done = tasks.filter((x) => x.status === "done");
    const overdue = tasks.filter(isOverdue);
    const onTime = done.filter((x) => new Date(x.due) >= new Date(x.createdAt)); // demo proxy
    const rate = done.length ? Math.round((done.length - overdue.filter((o) => o.status === "done").length) / done.length * 100) : 0;
    return { open, done, overdue, inProg: tasks.filter((x) => x.status === "in_progress"), rate: 92 };
  }, [tasks]);

  const statusData = STATUS_ORDER.map((s) => ({ name: STATUS[s].label, key: s, value: tasks.filter((x) => x.status === s).length, color: STATUS[s].color }));
  const prioData = Object.keys(PRIORITY).map((p) => ({ name: PRIORITY[p].label, value: tasks.filter((x) => x.priority === p).length, color: PRIORITY[p].color }));
  const workData = MEMBERS.filter((mm) => mm.role !== "admin").map((mm) => ({ name: mm.initials, value: tasks.filter((x) => x.assignee === mm.id && OPEN_STATUSES.includes(x.status)).length, color: mm.color }));

  const gridBg = {
    backgroundImage: `linear-gradient(${rgba(ACCENT, 0.07)} 1px, transparent 1px), linear-gradient(90deg, ${rgba(ACCENT, 0.07)} 1px, transparent 1px)`,
    backgroundSize: "22px 22px",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* hero — the blueprint-grid signature */}
      <Card pad={0} style={{ overflow: "hidden" }}>
        <div style={{ ...gridBg, padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: t.muted, fontWeight: 700, fontFamily: "ui-monospace, monospace", letterSpacing: 0.4 }}>MANAGER OVERVIEW · SPRINT 5</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: t.text, letterSpacing: -0.5, marginTop: 4 }}>Good morning, Maya</div>
            <div style={{ fontSize: 13.5, color: t.muted, marginTop: 3 }}>
              {m.open.length} open · <span style={{ color: m.overdue.length ? "#E11D48" : t.muted }}>{m.overdue.length} overdue</span> · {m.done.length} done
            </div>
          </div>
          <Btn variant="primary" icon={Plus} onClick={() => go("tasks", { create: true })}>New task</Btn>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        <Metric label="Open tasks" value={m.open.length} sub="across all clients" icon={ListChecks} tone={ACCENT} />
        <Metric label="Overdue" value={m.overdue.length} sub="need attention" icon={AlertTriangle} tone="#E11D48" />
        <Metric label="On-time rate" value={m.rate + "%"} sub="last 30 days" icon={TrendingUp} tone="#059669" />
        <Metric label="In progress" value={m.inProg.length} sub="being worked now" icon={Clock} tone="#2563EB" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }} className="tf-charts">
        <Card>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 10 }}>Tasks by status</div>
          <div style={{ height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.border} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: t.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: t.border }} />
                <YAxis tick={{ fill: t.faint, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: rgba(ACCENT, 0.06) }} contentStyle={tooltipStyle(t)} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={46}>
                  {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 10 }}>Priority split</div>
          <div style={{ height: 210, display: "flex", alignItems: "center" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={prioData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={3} stroke="none">
                  {prioData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle(t)} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingRight: 6 }}>
              {prioData.map((d) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: t.muted }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color }} /> {d.name} · <b style={{ color: t.text }}>{d.value}</b>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="tf-charts">
        <Card>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 10 }}>Open workload by member</div>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workData} layout="vertical" margin={{ top: 0, right: 10, left: 4, bottom: 0 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: t.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={34} />
                <Tooltip cursor={{ fill: rgba(ACCENT, 0.06) }} contentStyle={tooltipStyle(t)} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={20}>
                  {workData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 6 }}>Recent activity</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {activity.slice(0, 6).map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: i ? `1px solid ${t.border}` : "none" }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: a.color, marginTop: 6, flexShrink: 0 }} />
                <div style={{ fontSize: 13, color: t.text, lineHeight: 1.4 }}>
                  {a.text}
                  <span style={{ color: t.faint, fontSize: 11.5, marginLeft: 6, fontFamily: "ui-monospace, monospace" }}>{a.at}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
const tooltipStyle = (t) => ({ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, fontSize: 12, color: t.text, boxShadow: t.shadow });

/* ---------------------------------------------------------- tasks */
function Tasks({ tasks, query, filters, setFilters, openTask, onNew, clientFilter }) {
  const t = useT();
  const [group, setGroup] = useState("status");

  const filtered = useMemo(() => {
    return tasks.filter((x) => {
      if (query && !(`${x.title} ${x.ref || ""}`.toLowerCase().includes(query.toLowerCase()))) return false;
      if (filters.status !== "all" && x.status !== filters.status) return false;
      if (filters.priority !== "all" && x.priority !== filters.priority) return false;
      if (filters.assignee !== "all" && x.assignee !== filters.assignee) return false;
      if (clientFilter && x.clientId !== clientFilter) return false;
      return true;
    });
  }, [tasks, query, filters, clientFilter]);

  const groups = useMemo(() => {
    if (group === "none") return [{ key: "all", label: `${filtered.length} tasks`, items: filtered }];
    if (group === "client") return CLIENTS.map((c) => ({ key: c.id, label: c.name, items: filtered.filter((x) => x.clientId === c.id) })).filter((g) => g.items.length);
    return STATUS_ORDER.map((s) => ({ key: s, label: STATUS[s].label, color: STATUS[s].color, items: filtered.filter((x) => x.status === s) })).filter((g) => g.items.length);
  }, [filtered, group]);

  const sel = (v, k, opts) => (
    <select value={v} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))} style={{ ...inputStyle(t), width: "auto", padding: "8px 10px", cursor: "pointer" }}>
      {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {sel(filters.status, "status", [{ v: "all", l: "All status" }, ...STATUS_ORDER.map((s) => ({ v: s, l: STATUS[s].label }))])}
        {sel(filters.priority, "priority", [{ v: "all", l: "All priority" }, ...Object.keys(PRIORITY).map((p) => ({ v: p, l: PRIORITY[p].label }))])}
        {sel(filters.assignee, "assignee", [{ v: "all", l: "Anyone" }, ...MEMBERS.filter((m) => m.role !== "admin").map((m) => ({ v: m.id, l: m.name }))])}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <select value={group} onChange={(e) => setGroup(e.target.value)} style={{ ...inputStyle(t), width: "auto", padding: "8px 10px", cursor: "pointer" }}>
            <option value="status">Group: Status</option>
            <option value="client">Group: Client</option>
            <option value="none">No grouping</option>
          </select>
          <Btn variant="primary" icon={Plus} onClick={onNew}>New task</Btn>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.text }}>No tasks match these filters.</div>
          <div style={{ fontSize: 13, color: t.muted, marginTop: 6 }}>Clear a filter, or create the first one.</div>
          <div style={{ marginTop: 14 }}><Btn variant="outline" icon={Plus} onClick={onNew}>New task</Btn></div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groups.map((g) => (
            <div key={g.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "0 2px" }}>
                {g.color && <span style={{ width: 8, height: 8, borderRadius: 999, background: g.color }} />}
                <span style={{ fontWeight: 700, fontSize: 13.5, color: t.text }}>{g.label}</span>
                <span style={{ fontSize: 12, color: t.faint, fontFamily: "ui-monospace, monospace" }}>{g.items.length}</span>
              </div>
              <Card pad={0} style={{ overflow: "hidden" }}>
                {g.items.map((x, i) => <Row key={x.id} x={x} first={i === 0} onClick={() => openTask(x.id)} />)}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function Row({ x, first, onClick }) {
  const t = useT();
  const due = fmtDue(x.due);
  const done = x.subtasks.filter((s) => s.done).length;
  return (
    <div onClick={onClick} className="tf-row"
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer",
        borderTop: first ? "none" : `1px solid ${t.border}`,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = t.surfaceAlt)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, color: t.faint, width: 66, flexShrink: 0 }}>{x.ref || x.id}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: t.muted }}>{clientOf(x.clientId)?.name}</span>
          {x.subtasks.length > 0 && <span style={{ fontSize: 11.5, color: t.faint, fontFamily: "ui-monospace, monospace" }}>{done}/{x.subtasks.length} subtasks</span>}
          {x.comments.length > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, color: t.faint }}><MessageSquare size={12} />{x.comments.length}</span>}
        </div>
      </div>
      <Pill color={PRIORITY[x.priority].color}>{PRIORITY[x.priority].label}</Pill>
      <div className="tf-hide-sm"><Pill color={STATUS[x.status].color}>{STATUS[x.status].label}</Pill></div>
      <div className="tf-hide-sm" style={{ display: "flex", alignItems: "center", gap: 5, width: 78, justifyContent: "flex-end" }}>
        <Calendar size={13} color={due.warn ? "#E11D48" : t.faint} />
        <span style={{ fontSize: 12, color: due.warn ? "#E11D48" : t.muted, fontFamily: "ui-monospace, monospace" }}>{due.label}</span>
      </div>
      <Avatar id={x.assignee} />
    </div>
  );
}

/* ---------------------------------------------------------- task view (full screen) */
function Section({ t, label, action, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.muted, letterSpacing: 0.3 }}>{String(label).toUpperCase()}</div>
        {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
      </div>
      {children}
    </div>
  );
}
function FileCard({ f, t, onRemove }) {
  return (
    <div style={{ position: "relative", border: `1px solid ${t.border}`, borderRadius: 10, overflow: "hidden", background: t.surface }}>
      <button onClick={onRemove} title="Remove" style={{
        position: "absolute", top: 6, right: 6, zIndex: 2, width: 24, height: 24, borderRadius: 7, border: "none",
        background: "rgba(15,42,69,.6)", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center",
      }}><Trash2 size={13} /></button>
      {f.kind === "image" ? (
        <a href={f.url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
          <img src={f.url} alt={f.name} style={{ width: "100%", height: 104, objectFit: "cover", display: "block" }} />
        </a>
      ) : (
        <div style={{ height: 104, display: "grid", placeItems: "center", background: t.surfaceAlt }}>
          <FileText size={30} color={t.faint} />
        </div>
      )}
      <div style={{ padding: "7px 9px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
        <div style={{ fontSize: 11, color: t.faint, fontFamily: "ui-monospace, monospace" }}>{fmtSize(f.size)}</div>
      </div>
    </div>
  );
}
function UpdateLine({ a, t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 2 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: a.color || t.faint, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: t.muted, lineHeight: 1.4 }}>
        <b style={{ color: t.text, fontWeight: 600 }}>{memberOf(a.author)?.name || "Someone"}</b> {a.body}
        <span style={{ color: t.faint, marginLeft: 6, fontSize: 11.5, fontFamily: "ui-monospace, monospace" }}>{a.at}</span>
      </span>
    </div>
  );
}
function CommentBubble({ a, t }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <Avatar id={a.author} size={30} />
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: "9px 12px", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{memberOf(a.author)?.name}</span>
          <span style={{ fontSize: 11, color: t.faint }}>{a.at}</span>
        </div>
        <div style={{ fontSize: 14, color: t.text, marginTop: 3, lineHeight: 1.55, wordBreak: "break-word" }}>{a.body}</div>
      </div>
    </div>
  );
}

function TaskView({ task, onClose, actions, role }) {
  const t = useT();
  const [comment, setComment] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef();
  if (!task) return null;
  const files = task.files || [];
  const activity = task.activity || [];
  const subs = task.subtasks || [];
  const doneCount = subs.filter((s) => s.done).length;
  const canReopen = role === "manager" || role === "admin";

  const post = () => { if (comment.trim()) { actions.addComment(task.id, comment.trim()); setComment(""); } };
  const onPick = (e) => { if (e.target.files && e.target.files.length) actions.addFiles(task.id, e.target.files); e.target.value = ""; };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files && e.dataTransfer.files.length) actions.addFiles(task.id, e.dataTransfer.files); };

  const metaRows = [
    ["Priority", <Pill color={PRIORITY[task.priority].color}>{PRIORITY[task.priority].label}</Pill>],
    ["Assignee", <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Avatar id={task.assignee} size={22} /><span style={{ fontSize: 13, color: t.text }}>{memberOf(task.assignee)?.name}</span></span>],
    ["Client", <span style={{ fontSize: 13, color: t.text }}>{clientOf(task.clientId)?.name}</span>],
    ["Due", <span style={{ fontSize: 13, color: isOverdue(task) ? "#E11D48" : t.text, fontFamily: "ui-monospace, monospace" }}>{new Date(task.due).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>],
    ["Version", <span style={{ fontSize: 13, color: t.text, fontFamily: "ui-monospace, monospace" }}>{task.version || "—"}</span>],
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: t.canvas, display: "flex", flexDirection: "column" }}>
      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${t.border}`, background: t.surface }}>
        <button onClick={onClose} title="Back to tasks" style={{ ...iconBtn(t), width: 36, height: 36 }}><ArrowLeft size={18} /></button>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: t.faint }}>{task.ref || task.id}</span>
        <span style={{ fontSize: 11.5, color: t.muted, textTransform: "capitalize", padding: "2px 9px", border: `1px solid ${t.border}`, borderRadius: 999 }}>{task.type}</span>
        <div className="tf-hide-sm"><Pill color={STATUS[task.status].color}>{STATUS[task.status].label}</Pill></div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {task.status === "done" ? (
            <Btn variant="outline" icon={RotateCcw} onClick={() => actions.reopenOrRequest(task.id)}>{canReopen ? "Reopen task" : "Request reopen"}</Btn>
          ) : (
            <Btn variant="primary" icon={CheckCircle2} onClick={() => actions.changeStatus(task.id, "done")}>Mark done</Btn>
          )}
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "22px 20px 64px" }}>
          <div className="tf-taskgrid">
            {/* MAIN */}
            <div className="tf-main" style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 700, color: t.text, letterSpacing: -0.6, lineHeight: 1.25, margin: 0 }}>{task.title}</h1>
                <div style={{ fontSize: 13.5, color: t.muted, marginTop: 8 }}>{clientOf(task.clientId)?.name} · assigned to {memberOf(task.assignee)?.name}</div>
              </div>

              <Section t={t} label="Description">
                <div style={{ fontSize: 14.5, color: t.text, lineHeight: 1.6 }}>{task.description || "No description yet."}</div>
              </Section>

              <Section t={t} label={`Attachments · ${files.length}`}
                action={<Btn size="sm" variant="subtle" icon={UploadCloud} onClick={() => fileRef.current && fileRef.current.click()}>Upload</Btn>}>
                <input ref={fileRef} type="file" multiple onChange={onPick}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip" style={{ display: "none" }} />
                <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
                  style={{
                    border: `1.5px dashed ${drag ? ACCENT : t.border}`, background: drag ? rgba(ACCENT, 0.06) : t.surfaceAlt,
                    borderRadius: 12, padding: files.length ? 12 : 22, transition: "border-color .15s, background .15s",
                  }}>
                  {files.length === 0 ? (
                    <div onClick={() => fileRef.current && fileRef.current.click()} style={{ textAlign: "center", cursor: "pointer" }}>
                      <UploadCloud size={24} color={t.faint} />
                      <div style={{ fontSize: 13.5, color: t.text, fontWeight: 600, marginTop: 6 }}>Drop files here, or click to upload</div>
                      <div style={{ fontSize: 12, color: t.faint, marginTop: 2 }}>Documents, images and PDFs</div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                      {files.map((f) => <FileCard key={f.id} f={f} t={t} onRemove={() => actions.removeFile(task.id, f.id)} />)}
                    </div>
                  )}
                </div>
              </Section>

              {subs.length > 0 && (
                <Section t={t} label={`Sub-tasks · ${doneCount}/${subs.length}`}>
                  <div style={{ height: 6, borderRadius: 999, background: t.surfaceAlt, overflow: "hidden", marginBottom: 10 }}>
                    <div style={{ width: `${subs.length ? (doneCount / subs.length) * 100 : 0}%`, height: "100%", background: "#059669" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {subs.map((s) => (
                      <button key={s.id} onClick={() => actions.toggleSub(task.id, s.id)} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderRadius: 9, border: "none",
                        background: "transparent", cursor: "pointer", textAlign: "left",
                      }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = t.surfaceAlt)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <span style={{
                          width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center",
                          border: `1.5px solid ${s.done ? "#059669" : t.border}`, background: s.done ? "#059669" : "transparent",
                        }}>{s.done && <Check size={12} color="#fff" />}</span>
                        <span style={{ fontSize: 14, color: s.done ? t.faint : t.text, textDecoration: s.done ? "line-through" : "none" }}>{s.title}</span>
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              <Section t={t} label={`Activity · ${activity.length}`}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {activity.length === 0 && <div style={{ fontSize: 13, color: t.faint }}>No activity yet — post the first update.</div>}
                  {activity.map((a) => a.kind === "update"
                    ? <UpdateLine key={a.id} a={a} t={t} />
                    : <CommentBubble key={a.id} a={a} t={t} />)}
                  <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                    <Avatar id="u1" size={30} />
                    <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && post()}
                      placeholder="Add an update…" style={inputStyle(t)} />
                    <Btn variant="primary" icon={Send} onClick={post} disabled={!comment.trim()} style={{ flexShrink: 0 }}>Post</Btn>
                  </div>
                </div>
              </Section>
            </div>

            {/* SIDEBAR */}
            <div className="tf-side" style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.muted, marginBottom: 10 }}>STATUS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {STATUS_ORDER.map((s) => {
                    const active = task.status === s;
                    return (
                      <button key={s} onClick={() => actions.changeStatus(task.id, s)} style={{
                        padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        border: `1px solid ${active ? STATUS[s].color : t.border}`,
                        background: active ? rgba(STATUS[s].color, 0.14) : "transparent",
                        color: active ? STATUS[s].color : t.muted,
                      }}>{STATUS[s].label}</button>
                    );
                  })}
                </div>
                <div style={{ height: 1, background: t.border, margin: "14px 0" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {metaRows.map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12.5, color: t.faint, fontWeight: 600 }}>{k}</span>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- new task modal */
function NewTask({ onClose, onCreate }) {
  const t = useT();
  const [f, setF] = useState({ title: "", clientId: "c1", assignee: "u2", priority: "medium", type: "feature", due: addDays(7), description: "" });
  const upd = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const create = () => {
    if (!f.title.trim()) return;
    onCreate(mk({ ...f, status: "todo", version: "V1", createdAt: iso(TODAY) }));
  };
  const S = (k, opts) => (
    <select value={f[k]} onChange={(e) => upd(k, e.target.value)} style={{ ...inputStyle(t), cursor: "pointer" }}>
      {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,11,20,.55)" }} />
      <div style={{ position: "relative", width: "min(560px, 100%)", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, boxShadow: t.shadow, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.text }}>New task</div>
          <button onClick={onClose} style={{ marginLeft: "auto", ...iconBtn(t), width: 34, height: 34 }}><X size={17} /></button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Title">
            <input autoFocus value={f.title} onChange={(e) => upd("title", e.target.value)} placeholder="What needs doing?" style={inputStyle(t)} />
          </Field>
          <Field label="Description">
            <textarea value={f.description} onChange={(e) => upd("description", e.target.value)} rows={3} placeholder="Add detail…" style={{ ...inputStyle(t), resize: "vertical", fontFamily: "inherit" }} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Client">{S("clientId", CLIENTS.map((c) => ({ v: c.id, l: c.name })))}</Field>
            <Field label="Assignee">{S("assignee", MEMBERS.filter((m) => m.role !== "admin").map((m) => ({ v: m.id, l: m.name })))}</Field>
            <Field label="Priority">{S("priority", Object.keys(PRIORITY).map((p) => ({ v: p, l: PRIORITY[p].label })))}</Field>
            <Field label="Type">{S("type", [{ v: "feature", l: "Feature" }, { v: "bug", l: "Bug" }, { v: "improvement", l: "Improvement" }])}</Field>
            <Field label="Due date">
              <input type="date" value={f.due} onChange={(e) => upd("due", e.target.value)} style={inputStyle(t)} />
            </Field>
          </div>
        </div>
        <div style={{ padding: 16, borderTop: `1px solid ${t.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon={Plus} onClick={create} disabled={!f.title.trim()}>Create task</Btn>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- clients */
function Clients({ tasks, onOpen }) {
  const t = useT();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
      {CLIENTS.map((c) => {
        const list = tasks.filter((x) => x.clientId === c.id);
        const open = list.filter((x) => OPEN_STATUSES.includes(x.status)).length;
        const done = list.filter((x) => x.status === "done").length;
        const overdue = list.filter(isOverdue).length;
        const pct = list.length ? Math.round((done / list.length) * 100) : 0;
        return (
          <Card key={c.id} style={{ cursor: "pointer" }} className="tf-clientcard">
            <div onClick={() => onOpen(c.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: rgba(ACCENT, 0.13), display: "grid", placeItems: "center" }}>
                  <Building2 size={18} color={ACCENT} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: t.text, fontSize: 14.5 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: t.faint, fontFamily: "ui-monospace, monospace" }}>{list.length} tasks</div>
                </div>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: t.surfaceAlt, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ width: pct + "%", height: "100%", background: "#059669" }} />
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 12.5 }}>
                <span style={{ color: t.muted }}><b style={{ color: t.text, fontFamily: "ui-monospace, monospace" }}>{open}</b> open</span>
                <span style={{ color: t.muted }}><b style={{ color: t.text, fontFamily: "ui-monospace, monospace" }}>{done}</b> done</span>
                {overdue > 0 && <span style={{ color: "#E11D48" }}><b style={{ fontFamily: "ui-monospace, monospace" }}>{overdue}</b> overdue</span>}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------- reports */
function Reports({ tasks, toast }) {
  const t = useT();
  const rows = MEMBERS.filter((m) => m.role !== "admin").map((m) => {
    const list = tasks.filter((x) => x.assignee === m.id);
    const done = list.filter((x) => x.status === "done");
    const hrs = list.reduce((a, x) => a + (x.hours || 0), 0);
    const avg = done.length ? (hrs / done.length) : 0;
    const onTime = done.length ? Math.min(100, 78 + (m.id.charCodeAt(1) % 20)) : 0;
    return { m, assigned: list.length, done: done.length, onTime, avg: avg.toFixed(1), hrs: hrs.toFixed(1) };
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ fontSize: 13, color: t.muted }}>Productivity · last 30 days</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn variant="outline" icon={Download} onClick={() => toast("Preparing CSV export…", ACCENT)}>Export CSV</Btn>
          <Btn variant="outline" icon={Download} onClick={() => toast("Preparing PDF export…", ACCENT)}>Export PDF</Btn>
        </div>
      </div>
      <Card pad={0} style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "11px 16px", background: t.surfaceAlt, borderBottom: `1px solid ${t.border}`, fontSize: 12, fontWeight: 700, color: t.muted }}>
          <div>Member</div><div>Assigned</div><div>Completed</div><div>On-time</div><div>Avg / task</div>
        </div>
        {rows.map((r, i) => (
          <div key={r.m.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "13px 16px", borderTop: i ? `1px solid ${t.border}` : "none", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar id={r.m.id} /><span style={{ fontSize: 13.5, fontWeight: 600, color: t.text }}>{r.m.name}</span></div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: t.text }}>{r.assigned}</div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: t.text }}>{r.done}</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, maxWidth: 70, height: 6, borderRadius: 999, background: t.surfaceAlt, overflow: "hidden" }}>
                  <div style={{ width: r.onTime + "%", height: "100%", background: r.onTime >= 85 ? "#059669" : "#D97706" }} />
                </div>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: t.text }}>{r.onTime}%</span>
              </div>
            </div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: t.muted }}>{r.avg}h</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------- toasts */
function Toasts({ items }) {
  const t = useT();
  return (
    <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 100, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
      {items.map((it) => (
        <div key={it.id} style={{
          background: t.text, color: t.canvas, padding: "10px 16px", borderRadius: 10, fontSize: 13.5, fontWeight: 600,
          boxShadow: t.shadow, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: it.color }} />
          {it.text}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- app */
export default function App() {
  const [dark, setDark] = useState(false);
  const t = dark ? THEMES.dark : THEMES.light;
  const [view, setView] = useState("dashboard");
  const [tasks, setTasks] = useState(() =>
    SEED.map((tk) => ({
      ...tk,
      files: tk.files || [],
      activity: (tk.comments || []).map((c) => ({ ...c, kind: "comment" })),
    }))
  );
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [role, setRole] = useState("manager");
  const [menuOpen, setMenuOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState(null);
  const [filters, setFilters] = useState({ status: "all", priority: "all", assignee: "all" });
  const [toasts, setToasts] = useState([]);
  const [activity, setActivity] = useState([
    { text: "Sana closed Task-124 · Status, comments & attachments", at: "1h ago", color: "#059669" },
    { text: "Maya reopened Meeting notes → tasks", at: "4h ago", color: "#7C3AED" },
    { text: "Devon started Email-to-task automation", at: "6h ago", color: "#2563EB" },
    { text: "Leo was assigned RBAC (Admin/Manager/User)", at: "1d ago", color: ACCENT },
    { text: "Reopen requested on Reopen flow + member requests", at: "1d ago", color: "#D97706" },
  ]);

  const notifs = [
    { id: 1, icon: AlertTriangle, color: "#E11D48", text: "Manager dashboard is due tomorrow", at: "10m ago" },
    { id: 2, icon: RotateCcw, color: "#7C3AED", text: "Sana requested a reopen on TASK-127", at: "1h ago" },
    { id: 3, icon: MessageSquare, color: ACCENT, text: "You were mentioned in Sub-tasks", at: "3h ago" },
  ];

  const toast = (text, color = ACCENT) => {
    const id = Date.now() + Math.random();
    setToasts((s) => [...s, { id, text, color }]);
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 2400);
  };
  const logActivity = (text, color) => setActivity((a) => [{ text, at: "just now", color }, ...a]);

  const updateTask = (id, fn) => setTasks((ts) => ts.map((x) => (x.id === id ? fn(x) : x)));
  const titleOf = (id) => (tasks.find((x) => x.id === id) || {}).title || "Task";

  const changeStatus = (id, s) => {
    updateTask(id, (x) => ({ ...x, status: s, activity: [...(x.activity || []), mkUpdate(`moved this to ${STATUS[s].label}`, STATUS[s].color)] }));
    toast(`Moved to ${STATUS[s].label}`, STATUS[s].color);
    logActivity(`${titleOf(id)} → ${STATUS[s].label}`, STATUS[s].color);
  };
  const toggleSub = (id, sid) => updateTask(id, (x) => {
    const sub = x.subtasks.find((s) => s.id === sid);
    const nowDone = !sub.done;
    return {
      ...x,
      subtasks: x.subtasks.map((s) => (s.id === sid ? { ...s, done: nowDone } : s)),
      activity: [...(x.activity || []), mkUpdate(`${nowDone ? "completed" : "reopened"} sub-task “${sub.title}”`, nowDone ? "#059669" : "#D97706")],
    };
  });
  const addComment = (id, body) => {
    updateTask(id, (x) => ({ ...x, activity: [...(x.activity || []), mkComment(body)] }));
    toast("Update posted", ACCENT);
  };
  const addFiles = async (id, fileList) => {
    const items = await readFiles(fileList);
    if (!items.length) return;
    const n = items.length;
    updateTask(id, (x) => ({
      ...x, files: [...(x.files || []), ...items],
      activity: [...(x.activity || []), mkUpdate(`uploaded ${n} file${n > 1 ? "s" : ""}`, ACCENT)],
    }));
    toast(`Uploaded ${n} file${n > 1 ? "s" : ""}`, "#059669");
    logActivity(`${n} file${n > 1 ? "s" : ""} added to ${titleOf(id)}`, ACCENT);
  };
  const removeFile = (id, fid) => updateTask(id, (x) => ({ ...x, files: (x.files || []).filter((f) => f.id !== fid) }));
  const reopenOrRequest = (id) => {
    if (role === "manager" || role === "admin") changeStatus(id, "reopened");
    else {
      updateTask(id, (x) => ({ ...x, activity: [...(x.activity || []), mkUpdate("requested a reopen", "#7C3AED")] }));
      toast("Reopen requested — pending manager approval", "#7C3AED");
    }
  };
  const taskActions = { changeStatus, toggleSub, addComment, addFiles, removeFile, reopenOrRequest };
  const createTask = (task) => {
    setTasks((ts) => [task, ...ts]);
    setCreating(false);
    toast("Task created", "#059669");
    logActivity(`New task created · ${task.title}`, "#059669");
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setOpenId(null); setCreating(false); setMenuOpen(false); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (v, opts = {}) => { setView(v); if (opts.create) setCreating(true); };
  const openTask = (id) => setOpenId(id);
  const current = tasks.find((x) => x.id === openId);

  return (
    <Ctx.Provider value={t}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 999px; }
        input::placeholder, textarea::placeholder { color: ${t.faint}; }
        input:focus, textarea:focus, select:focus, button:focus-visible { box-shadow: 0 0 0 3px ${t.ring}; }
        select { -webkit-appearance: none; appearance: none; }
        .tf-taskgrid { display: grid; grid-template-columns: 1fr 320px; gap: 20px; align-items: start; }
        @media (max-width: 860px) {
          .tf-desktop-only { display: none !important; }
          .tf-charts { grid-template-columns: 1fr !important; }
          .tf-hide-sm { display: none !important; }
          .tf-taskgrid { grid-template-columns: 1fr !important; }
          .tf-side { order: -1; }
        }
        @media (min-width: 861px) { .tf-mobile-only { display: none !important; } }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div style={{ display: "flex", height: "100vh", width: "100%", background: t.canvas, color: t.text, fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <Sidebar view={view} setView={setView} open={menuOpen} close={() => setMenuOpen(false)} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Topbar view={view} query={query} setQuery={setQuery} dark={dark} setDark={setDark}
            role={role} setRole={setRole} notifs={notifs} onOpenMenu={() => setMenuOpen(true)} />

          {/* client filter chip */}
          {view === "tasks" && clientFilter && (
            <div style={{ padding: "10px 20px 0" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: rgba(ACCENT, 0.12), color: ACCENT, borderRadius: 999, padding: "5px 12px", fontSize: 13, fontWeight: 600 }}>
                Client: {clientOf(clientFilter)?.name}
                <button onClick={() => setClientFilter(null)} style={{ border: "none", background: "transparent", color: ACCENT, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={14} /></button>
              </span>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {view === "dashboard" && <Dashboard tasks={tasks} activity={activity} go={go} />}
            {view === "tasks" && (
              <Tasks tasks={tasks} query={query} filters={filters} setFilters={setFilters}
                openTask={openTask} onNew={() => setCreating(true)} clientFilter={clientFilter} />
            )}
            {view === "clients" && <Clients tasks={tasks} onOpen={(cid) => { setClientFilter(cid); setView("tasks"); }} />}
            {view === "reports" && <Reports tasks={tasks} toast={toast} />}
          </div>
        </div>
      </div>

      {current && <TaskView task={current} onClose={() => setOpenId(null)} actions={taskActions} role={role} />}
      {creating && <NewTask onClose={() => setCreating(false)} onCreate={createTask} />}
      <Toasts items={toasts} />
    </Ctx.Provider>
  );
}
