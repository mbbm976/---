import { useState, useEffect, useContext, createContext, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

// ============================================================
// SECTION 1: CONSTANTS & THEME
// ============================================================
const THEME = {
  bg: "#0f1923",
  bgCard: "#162231",
  bgCardHover: "#1a2a3d",
  bgInput: "#0d1a27",
  border: "#1e3a5a",
  borderLight: "#2a4a6a",
  primary: "#1a9fe0",
  primaryDark: "#1280b8",
  primaryLight: "#3ab5f0",
  accent: "#f0a500",
  accentLight: "#f5c040",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  textPrimary: "#e8f0fe",
  textSecondary: "#8ba3bc",
  textMuted: "#4a6a8a",
  white: "#ffffff",
  shadow: "0 4px 24px rgba(0,0,0,0.4)",
  shadowSm: "0 2px 8px rgba(0,0,0,0.3)",
  radius: "10px",
  radiusSm: "6px",
  fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
};

const ROLES = [
  { id: "admin", label: "Админ" },
  { id: "engineer", label: "Талбайн инженер" },
  { id: "team_lead", label: "Багийн ахлагч" },
  { id: "hse", label: "HSE ажилтан" },
  { id: "qaqc", label: "QA/QC инженер" },
  { id: "manager", label: "Төслийн менежер" },
  { id: "client", label: "Захиалагч / Зөвлөх" },
];

const TEAM_TYPES = [
  "Иргэншил / Civil works","Цахилгаан","Дулаан","Ус хангамж",
  "Механик","Архитектур","Газар шорооны ажил","Бетон цутгалт",
  "Төмөр хийц","Дотоод засал","HSE","QA/QC",
];

const REPORT_STATUSES = {
  Draft: { label: "Ноорог", color: THEME.textMuted },
  Submitted: { label: "Илгээсэн", color: THEME.primary },
  UnderReview: { label: "Хянагдаж байна", color: THEME.warning },
  Returned: { label: "Буцаагдсан", color: THEME.danger },
  ApprovedByManager: { label: "Менежер баталсан", color: THEME.success },
  ApprovedByClient: { label: "Захиалагч баталсан", color: "#a78bfa" },
  Archived: { label: "Архивласан", color: THEME.textSecondary },
};

const IMPACT_LEVELS = ["Бага","Дунд","Өндөр","Ноцтой"];
const DELAY_CATEGORIES = ["Материал","Тоног төхөөрөмж","Хүн хүч","Зураг төсөл","Цаг агаар","Захиалагчийн шийдвэр","Зөвшөөрөл / permit","Чанарын асуудал","HSE зогсолт"];
const RESPONSIBLE_PARTIES = ["Contractor","Client","Consultant","Weather","Supplier","Design","Authority / Permit"];
const EQUIPMENT_STATUSES = ["Ажиллаж байгаа","Сул зогссон","Эвдэрсэн","Засвартай"];
const ACTION_SOURCES = ["HSE","QA/QC","Issue","Client","Management"];
const PRIORITIES = ["Өндөр","Дунд","Бага"];
const ACTION_STATUSES = ["Open","In Progress","Closed","Overdue"];

// ============================================================
// SECTION 2: LOCALSTORAGE HELPERS
// ============================================================
const LS = {
  get: (key, fallback = null) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set: (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.warn("LS write failed", e); }
  },
  remove: (key) => { try { localStorage.removeItem(key); } catch {} },
};

const newId = () => `id_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;

const newReport = (user) => ({
  id: `RPT-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${Math.floor(Math.random()*900+100)}`,
  version: 1,
  status: "Draft",
  completenessScore: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: { name: user?.name || "", role: user?.role || "" },
  general: {
    date: new Date().toISOString().slice(0,10),
    project: "", contract: "", wbs: "", location: "", zone: "",
    floor: "", gridline: "", client: "", contractor: "", subcontractor: "",
    preparedBy: user?.name || "", weather: "", temp: "", wind: "",
    precipitation: "", shift: "Өдөр", startTime: "08:00", endTime: "17:00",
  },
  teams: [],
  manhours: { plannedWorkers: 0, actualWorkers: 0, plannedHours: 0, actualHours: 0, overtime: 0, idleHours: 0 },
  workProgress: [],
  delays: [],
  quantities: [],
  hse: {
    manhoursToday: 0, cumulativeMH: 0, toolboxTalk: false, toolboxTopic: "",
    toolboxParticipants: 0, lti: 0, mtc: 0, fac: 0, nearMiss: 0, incident: 0,
    unsafeAct: 0, unsafeCondition: 0, stopWork: false, permitToWork: "",
    workAtHeight: false, liftingOp: false, hotWork: false, confinedSpace: false,
    ppeCompliance: 100, hseInspection: 0, observations: 0, correctiveRaised: 0,
    correctiveClosed: 0, notes: "",
  },
  qaqc: {
    inspectionDone: false, irn: "", checklistRef: "", itpRef: "",
    holdPoint: false, witnessPoint: false, result: "", ncrNumber: "", rfiNumber: "",
    defect: false, reworkRequired: false, drawingNumber: "", revision: "",
    responsiblePerson: "", notes: "",
  },
  equipment: [],
  materials: [],
  costs: { labor: 0, equipment: 0, material: 0, transport: 0, other: 0, plannedTotal: 0 },
  visitors: [],
  tomorrowPlan: [],
  actionTracker: [],
  notes: { general: "", clientNotice: "", escalation: "", followUp: "" },
  photos: [],
  signatures: { prepared: null, reviewed: null, approved: null, clientApproved: null },
  auditTrail: [],
  revisionLog: [],
});

// ============================================================
// SECTION 3: CALCULATION HELPERS
// ============================================================
function calcCompleteness(report) {
  if (!report) return 0;
  const g = report.general;
  const checks = [
    { w: 15, v: g.date && g.project && g.location && g.preparedBy },
    { w: 10, v: report.teams.length > 0 },
    { w: 10, v: report.manhours.actualHours > 0 },
    { w: 15, v: report.workProgress.length > 0 },
    { w: 15, v: report.hse.toolboxTalk !== undefined && report.hse.manhoursToday >= 0 },
    { w: 10, v: report.qaqc.inspectionDone !== undefined },
    { w: 10, v: report.materials.length > 0 },
    { w: 5,  v: report.actionTracker.length > 0 },
    { w: 5,  v: report.photos.length > 0 },
    { w: 5,  v: report.signatures.prepared !== null },
  ];
  return checks.reduce((s, c) => s + (c.v ? c.w : 0), 0);
}

function generateAlerts(reports) {
  const alerts = [];
  if (!reports || reports.length === 0) return alerts;
  const recent = reports.filter(r => r.status !== "Archived").slice(-1)[0];
  if (!recent) return alerts;

  const avgProg = recent.workProgress.length > 0
    ? recent.workProgress.reduce((s, w) => s + (w.completion || 0), 0) / recent.workProgress.length : 100;
  if (avgProg < 70) alerts.push({ level: "red", msg: `Ажлын биелэлт ${avgProg.toFixed(0)}% — Хяналт шаардлагатай` });
  if (recent.hse.lti > 0) alerts.push({ level: "red", msg: `LTI бүртгэгдсэн: ${recent.hse.lti}` });
  if (recent.hse.nearMiss > 0) alerts.push({ level: "red", msg: `Near Miss: ${recent.hse.nearMiss}` });
  if (recent.equipment.some(e => e.status === "Эвдэрсэн")) alerts.push({ level: "orange", msg: "Эвдэрсэн тоног төхөөрөмж байна" });
  if (recent.hse.ppeCompliance < 90) alerts.push({ level: "orange", msg: `PPE compliance: ${recent.hse.ppeCompliance}%` });
  const overdue = recent.actionTracker.filter(a => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== "Closed");
  if (overdue.length > 0) alerts.push({ level: "orange", msg: `Хугацаа хэтэрсэн ${overdue.length} action байна` });
  const totalCost = (recent.costs.labor||0)+(recent.costs.equipment||0)+(recent.costs.material||0)+(recent.costs.transport||0)+(recent.costs.other||0);
  if (recent.costs.plannedTotal > 0 && totalCost > recent.costs.plannedTotal) alerts.push({ level: "orange", msg: "Зардал төлөвлөгөөнөөс давсан" });
  return alerts;
}

function carryOver(prevReport, todayDate, user) {
  const base = newReport(user);
  base.general = {
    ...base.general,
    project: prevReport.general.project,
    location: prevReport.general.location,
    contract: prevReport.general.contract,
    client: prevReport.general.client,
    contractor: prevReport.general.contractor,
    date: todayDate,
  };
  base.teams = prevReport.teams.map(t => ({
    ...t, id: newId(), actualHours: 0, completedWork: "", notes: "",
  }));
  base.workProgress = prevReport.workProgress
    .filter(w => (w.completion || 0) < 100)
    .map(w => ({ ...w, id: newId(), completedToday: 0 }));
  base.actionTracker = prevReport.actionTracker
    .filter(a => a.status !== "Closed")
    .map(a => ({ ...a, id: newId(), carriedOver: true }));
  base.tomorrowPlan = [];
  return base;
}

function validateReport(report) {
  const errors = [];
  const g = report.general;
  if (!g.date) errors.push("Огноо заавал бөглөгдөх ёстой");
  if (!g.project) errors.push("Төслийн нэр заавал бөглөгдөх ёстой");
  if (!g.location) errors.push("Байршил заавал бөглөгдөх ёстой");
  if (!g.preparedBy) errors.push("Тайлан бэлтгэсэн ажилтан заавал бөглөгдөх ёстой");
  if (report.manhours.actualHours < 0) errors.push("Бодит хүн цаг сөрөг байж болохгүй");
  if (report.manhours.plannedHours < 0) errors.push("Төлөвлөгөөт хүн цаг сөрөг байж болохгүй");
  report.workProgress.forEach((w, i) => {
    if (w.completion < 0 || w.completion > 100) errors.push(`Ажил ${i+1}: биелэлт % 0-100 хооронд байна`);
  });
  return errors;
}

function generateRefCode(report) {
  const raw = `daily-report://${(report.general.project||"project").toLowerCase().replace(/\s+/g,"-")}/${report.id}/${report.general.date}/${report.status}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = ((hash << 5) - hash) + raw.charCodeAt(i);
  const h = Math.abs(hash).toString(16).toUpperCase().padStart(8,"0");
  return { raw, display: `DR-${h.slice(0,4)}-${h.slice(4,8)}` };
}

function isOverdue(action) {
  return action.dueDate && new Date(action.dueDate) < new Date() && action.status !== "Closed";
}

// ============================================================
// SECTION 4: EXCEL EXPORT
// ============================================================
function exportToExcel(report) {
  const wb = XLSX.utils.book_new();
  const headerStyle = { font: { bold: true } };
  const addSheet = (name, rows) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet("1-Summary", [
    ["ӨДӨР ТУТМЫН ТАЙЛАН — НЭГТГЭЛ"],
    ["Тайлангийн дугаар", report.id],
    ["Огноо", report.general.date],
    ["Төсөл", report.general.project],
    ["Байршил", report.general.location],
    ["Статус", REPORT_STATUSES[report.status]?.label || report.status],
    ["Бүрэн байдал %", report.completenessScore],
    ["Бэлтгэсэн", report.general.preparedBy],
    ["Цаг агаар", report.general.weather],
    ["Ээлж", report.general.shift],
    ["Эхэлсэн цаг", report.general.startTime],
    ["Дууссан цаг", report.general.endTime],
  ]);

  addSheet("2-Manhours", [
    ["Төлөвлөгөөт ажилчид","Бодит ажилчид","Төлөвлөгөөт цаг","Бодит цаг","Илүү цаг","Сул зогсолт"],
    [report.manhours.plannedWorkers, report.manhours.actualWorkers,
     report.manhours.plannedHours, report.manhours.actualHours,
     report.manhours.overtime, report.manhours.idleHours],
  ]);

  addSheet("3-WorkProgress", [
    ["Ажлын нэр","Байршил","Тоо хэмжээ","Нэгж","Биелэлт %","Баг","Тэмдэглэл"],
    ...report.workProgress.map(w => [w.name, w.location, w.quantity, w.unit, w.completion, w.team, w.notes]),
  ]);

  addSheet("4-TeamReports", [
    ["Багийн нэр","Ахлагч","Ажилчид","Төлөвлөгөөт цаг","Бодит цаг","Гүйцэтгэсэн ажил","Тэмдэглэл"],
    ...report.teams.map(t => [t.teamType, t.lead, t.workers, t.plannedHours, t.actualHours, t.completedWork, t.notes]),
  ]);

  addSheet("5-QuantityTrack", [
    ["WBS","Ажлын тайлбар","Нэгж","Өнөөдрийн төлөвлөгөө","Өнөөдрийн бодит","Хуримтлагдсан төлөвлөгөө","Хуримтлагдсан бодит","Зөрүү","Явц %"],
    ...report.quantities.map(q => [q.wbs,q.description,q.unit,q.plannedToday,q.actualToday,q.cumPlanned,q.cumActual,(q.cumActual-q.cumPlanned),q.progress]),
  ]);

  addSheet("6-DelayAnalysis", [
    ["Үйл явдал","Ангилал","Эхлэсэн","Дууссан","Нийт цаг","Хариуцагч тал","Нөлөөлөл","Нөхөн арга хэмжээ"],
    ...report.delays.map(d => [d.event,d.category,d.startTime,d.endTime,d.totalHours,d.responsible,d.impact,d.recovery]),
  ]);

  addSheet("7-HSE", [
    ["Хүн цаг","Хуримтлагдсан","Toolbox Talk","Сэдэв","Оролцсон","LTI","MTC","FAC","Near Miss","Incident","PPE%","Inspection"],
    [report.hse.manhoursToday,report.hse.cumulativeMH,report.hse.toolboxTalk?"Тийм":"Үгүй",
     report.hse.toolboxTopic,report.hse.toolboxParticipants,report.hse.lti,
     report.hse.mtc,report.hse.fac,report.hse.nearMiss,report.hse.incident,
     report.hse.ppeCompliance,report.hse.hseInspection],
  ]);

  addSheet("8-QAQC", [
    ["Inspection","IRN","Checklist","ITP","Hold Point","Үр дүн","NCR","RFI","Defect","Drawing","Revision","Хариуцагч"],
    [report.qaqc.inspectionDone?"Тийм":"Үгүй",report.qaqc.irn,report.qaqc.checklistRef,
     report.qaqc.itpRef,report.qaqc.holdPoint?"Тийм":"Үгүй",report.qaqc.result,
     report.qaqc.ncrNumber,report.qaqc.rfiNumber,report.qaqc.defect?"Тийм":"Үгүй",
     report.qaqc.drawingNumber,report.qaqc.revision,report.qaqc.responsiblePerson],
  ]);

  addSheet("9-Equipment", [
    ["Нэр","ID","Төлөв","Ажилласан цаг","Сул цаг","Эвдрэлийн шалтгаан","Operator","Тэмдэглэл"],
    ...report.equipment.map(e => [e.name,e.equipmentId,e.status,e.workHours,e.idleHours,e.breakdownReason,e.operator,e.notes]),
  ]);

  addSheet("10-Materials", [
    ["Нэр","Нэгж","Төлөвлөгөө","Бодит","Зөрүү","Ирсэн","Үлдэгдэл","Асуудал","Тэмдэглэл"],
    ...report.materials.map(m => [m.name,m.unit,m.planned,m.actual,(m.actual-m.planned),m.received,m.remaining,m.issue,m.notes]),
  ]);

  addSheet("11-Costs", [
    ["Хөдөлмөр","Тоног төхөөрөмж","Материал","Тээвэр","Бусад","Нийт","Төлөвлөгөөт","Зөрүү"],
    [report.costs.labor,report.costs.equipment,report.costs.material,
     report.costs.transport,report.costs.other,
     (report.costs.labor+report.costs.equipment+report.costs.material+report.costs.transport+report.costs.other),
     report.costs.plannedTotal,
     (report.costs.labor+report.costs.equipment+report.costs.material+report.costs.transport+report.costs.other)-report.costs.plannedTotal],
  ]);

  addSheet("12-Issues", [
    ["Тайлбар","Нөлөөлөл","Нөлөөлсөн чиглэл","Авсан арга хэмжээ","Хариуцагч","Дуусгах огноо","Статус"],
    ...report.workProgress.filter(w=>w.delayReason).map(w=>[w.delayReason,"",""," ","","",""]),
  ]);

  addSheet("13-ActionTracker", [
    ["ID","Тайлбар","Эх сурвалж","Хариуцагч","Дуусах огноо","Ач холбогдол","Статус"],
    ...report.actionTracker.map(a=>[a.id,a.description,a.source,a.responsible,a.dueDate,a.priority,a.status]),
  ]);

  addSheet("14-Visitors", [
    ["Нэр","Байгууллага","Албан тушаал","Ирсэн","Явсан","Зорилго","HSE Induction"],
    ...report.visitors.map(v=>[v.name,v.org,v.position,v.arrival,v.departure,v.purpose,v.hseInduction?"Тийм":"Үгүй"]),
  ]);

  addSheet("15-TomorrowPlan", [
    ["Ажил","Баг","Хүн хүч","Материал","Тоног төхөөрөмж","Эрсдэл","Ач холбогдол"],
    ...report.tomorrowPlan.map(t=>[t.work,t.team,t.manpower,t.materials,t.equipment,t.risk,t.priority]),
  ]);

  addSheet("16-ApprovalLog", [
    ["Хэн","Үүрэг","Үйлдэл","Цаг","Тайлбар","Өмнөх статус","Шинэ статус"],
    ...report.auditTrail.map(a=>[a.actor,a.role,a.action,a.timestamp,a.comment,a.fromStatus,a.toStatus]),
  ]);

  const filename = `Daily_Report_${(report.general.project||"Project").replace(/\s+/g,"_")}_${report.general.date}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ============================================================
// SECTION 5: CONTEXT
// ============================================================
const AppContext = createContext(null);

function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(LS.get("cdr_user") || null);
  const [reports, setReports] = useState(LS.get("cdr_reports") || []);
  const [currentReport, setCurrentReport] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [activeSection, setActiveSection] = useState(0);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);

  useEffect(() => { if (currentUser) LS.set("cdr_user", currentUser); }, [currentUser]);
  useEffect(() => { LS.set("cdr_reports", reports); }, [reports]);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const saveReport = useCallback((rep) => {
    const updated = { ...rep, updatedAt: new Date().toISOString(), completenessScore: calcCompleteness(rep) };
    setReports(prev => {
      const idx = prev.findIndex(r => r.id === updated.id);
      if (idx >= 0) { const arr = [...prev]; arr[idx] = updated; return arr; }
      return [...prev, updated];
    });
    setCurrentReport(updated);
    return updated;
  }, []);

  const deleteReport = useCallback((id) => {
    setReports(prev => prev.filter(r => r.id !== id));
    showToast("Тайлан устгагдлаа", "info");
  }, [showToast]);

  const addAudit = useCallback((rep, action, comment, fromStatus, toStatus) => {
    const entry = {
      id: newId(), actor: currentUser.name, role: currentUser.role,
      action, timestamp: new Date().toISOString(), comment, fromStatus, toStatus,
    };
    return { ...rep, auditTrail: [...rep.auditTrail, entry], status: toStatus || rep.status };
  }, [currentUser]);

  const alerts = generateAlerts(reports);

  return (
    <AppContext.Provider value={{
      currentUser, setCurrentUser, reports, currentReport, setCurrentReport,
      activeView, setActiveView, activeSection, setActiveSection,
      toast, showToast, modal, setModal, saveReport, deleteReport, addAudit, alerts,
    }}>
      {children}
    </AppContext.Provider>
  );
}

const useApp = () => useContext(AppContext);

// ============================================================
// SECTION 6: SHARED UI COMPONENTS
// ============================================================
function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  const bg = toast.type === "success" ? THEME.success : toast.type === "danger" ? THEME.danger : toast.type === "info" ? THEME.primary : THEME.warning;
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: bg, color: "#fff", padding: "12px 20px",
      borderRadius: THEME.radius, boxShadow: THEME.shadow,
      fontFamily: THEME.fontFamily, fontSize: 14, fontWeight: 600,
      animation: "slideIn 0.3s ease",
    }}>
      {toast.msg}
    </div>
  );
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 8000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: THEME.bgCard, borderRadius: THEME.radius, padding: 24,
        width: "100%", maxWidth: wide ? 800 : 480, maxHeight: "90vh", overflowY: "auto",
        border: `1px solid ${THEME.border}`, boxShadow: THEME.shadow,
        fontFamily: THEME.fontFamily,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: THEME.textPrimary, fontSize: 18 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: THEME.textSecondary, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", size = "md", disabled, style: sx }) {
  const base = {
    border: "none", cursor: disabled ? "not-allowed" : "pointer", fontFamily: THEME.fontFamily,
    fontWeight: 600, borderRadius: THEME.radiusSm, transition: "all 0.2s",
    opacity: disabled ? 0.5 : 1,
    fontSize: size === "sm" ? 12 : size === "lg" ? 16 : 14,
    padding: size === "sm" ? "6px 12px" : size === "lg" ? "14px 28px" : "9px 18px",
  };
  const variants = {
    primary: { background: THEME.primary, color: "#fff" },
    success: { background: THEME.success, color: "#fff" },
    danger: { background: THEME.danger, color: "#fff" },
    warning: { background: THEME.warning, color: "#fff" },
    secondary: { background: THEME.bgCardHover, color: THEME.textPrimary, border: `1px solid ${THEME.border}` },
    ghost: { background: "transparent", color: THEME.textSecondary, border: `1px solid ${THEME.border}` },
    accent: { background: THEME.accent, color: "#000" },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...sx }}>{children}</button>;
}

function Input({ label, value, onChange, type = "text", placeholder, required, min, max, style: sx }) {
  return (
    <div style={{ marginBottom: 12, ...sx }}>
      {label && <label style={{ display: "block", fontSize: 12, color: THEME.textSecondary, marginBottom: 4, fontFamily: THEME.fontFamily }}>
        {label}{required && <span style={{ color: THEME.danger }}> *</span>}
      </label>}
      <input
        type={type} value={value ?? ""} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} min={min} max={max}
        style={{
          width: "100%", background: THEME.bgInput, border: `1px solid ${THEME.border}`,
          borderRadius: THEME.radiusSm, color: THEME.textPrimary, padding: "8px 12px",
          fontFamily: THEME.fontFamily, fontSize: 14, outline: "none", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function Select({ label, value, onChange, options, required, style: sx }) {
  return (
    <div style={{ marginBottom: 12, ...sx }}>
      {label && <label style={{ display: "block", fontSize: 12, color: THEME.textSecondary, marginBottom: 4, fontFamily: THEME.fontFamily }}>
        {label}{required && <span style={{ color: THEME.danger }}> *</span>}
      </label>}
      <select
        value={value ?? ""} onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", background: THEME.bgInput, border: `1px solid ${THEME.border}`,
          borderRadius: THEME.radiusSm, color: THEME.textPrimary, padding: "8px 12px",
          fontFamily: THEME.fontFamily, fontSize: 14, outline: "none",
        }}
      >
        <option value="">— Сонгох —</option>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </div>
  );
}

function Textarea({ label, value, onChange, rows = 3, placeholder }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <label style={{ display: "block", fontSize: 12, color: THEME.textSecondary, marginBottom: 4, fontFamily: THEME.fontFamily }}>{label}</label>}
      <textarea
        value={value ?? ""} onChange={e => onChange(e.target.value)}
        rows={rows} placeholder={placeholder}
        style={{
          width: "100%", background: THEME.bgInput, border: `1px solid ${THEME.border}`,
          borderRadius: THEME.radiusSm, color: THEME.textPrimary, padding: "8px 12px",
          fontFamily: THEME.fontFamily, fontSize: 14, outline: "none",
          resize: "vertical", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8, fontFamily: THEME.fontFamily, fontSize: 14, color: THEME.textPrimary }}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
      {label}
    </label>
  );
}

function Card({ children, style: sx, title, action }) {
  return (
    <div style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: THEME.radius, padding: 20, marginBottom: 16, ...sx }}>
      {(title || action) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          {title && <h3 style={{ margin: 0, fontSize: 15, color: THEME.textPrimary, fontFamily: THEME.fontFamily, fontWeight: 700 }}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      background: color + "22", color: color, fontSize: 11, fontWeight: 700,
      fontFamily: THEME.fontFamily, border: `1px solid ${color}44`,
    }}>{label}</span>
  );
}

function ProgressBar({ value, max = 100, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const c = color || (pct >= 90 ? THEME.success : pct >= 70 ? THEME.warning : THEME.danger);
  return (
    <div style={{ background: THEME.bgInput, borderRadius: 4, height: 8, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: c, borderRadius: 4, transition: "width 0.4s" }} />
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: THEME.radius,
      padding: "16px 20px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ fontSize: 28, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || THEME.primary, fontFamily: THEME.fontFamily }}>{value}</div>
      <div style={{ fontSize: 12, color: THEME.textSecondary, fontFamily: THEME.fontFamily }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: THEME.textMuted, marginTop: 2, fontFamily: THEME.fontFamily }}>{sub}</div>}
      <div style={{
        position: "absolute", right: -10, top: -10, width: 60, height: 60,
        borderRadius: "50%", background: (color || THEME.primary) + "15",
      }} />
    </div>
  );
}

// ============================================================
// SECTION 7: SVG CHARTS
// ============================================================
function BarChart({ data, width = 340, height = 140 }) {
  if (!data || data.length === 0) return <div style={{ color: THEME.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>Мэдээлэл байхгүй</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.floor((width - 40) / data.length) - 4;
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {data.map((d, i) => {
        const bh = Math.max(2, ((d.value / max) * (height - 40)));
        const x = 20 + i * ((width - 40) / data.length);
        const y = height - 20 - bh;
        const c = d.value >= 90 ? THEME.success : d.value >= 70 ? THEME.warning : THEME.danger;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} rx={3} fill={c} opacity={0.9} />
            <text x={x + barW/2} y={y - 4} textAnchor="middle" fontSize={10} fill={THEME.textSecondary}>{d.value}%</text>
            <text x={x + barW/2} y={height - 4} textAnchor="middle" fontSize={9} fill={THEME.textMuted}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ segments, size = 120 }) {
  const r = 44, cx = 60, cy = 60;
  let total = segments.reduce((s, d) => s + d.value, 0) || 1;
  let angle = -Math.PI / 2;
  const paths = segments.map((seg) => {
    const a = (seg.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    angle += a;
    const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
    const lg = a > Math.PI ? 1 : 0;
    return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${lg} 1 ${x2} ${y2} Z`, fill: seg.color, label: seg.label, value: seg.value };
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        {paths.map((p, i) => <path key={i} d={p.d} fill={p.fill} opacity={0.9} />)}
        <circle cx={cx} cy={cy} r={28} fill={THEME.bgCard} />
        <text x={cx} y={cy+4} textAnchor="middle" fontSize={13} fontWeight="bold" fill={THEME.textPrimary}>{total}</text>
      </svg>
      <div>
        {segments.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 12, color: THEME.textSecondary, fontFamily: THEME.fontFamily }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
            {s.label}: <strong style={{ color: THEME.textPrimary }}>{s.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// SECTION 8: SIGNATURE CANVAS
// ============================================================
function SignatureCanvas({ value, onChange, label }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasSig, setHasSig] = useState(!!value);

  useEffect(() => {
    if (value && canvasRef.current) {
      const img = new Image();
      img.onload = () => canvasRef.current?.getContext("2d").drawImage(img, 0, 0);
      img.src = value;
      setHasSig(true);
    }
  }, []);

  const getPos = (e, canvas) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return [t.clientX - r.left, t.clientY - r.top];
  };

  const start = (e) => {
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const [x, y] = getPos(e, canvasRef.current);
    ctx.beginPath(); ctx.moveTo(x, y);
    e.preventDefault();
  };

  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#1a9fe0";
    const [x, y] = getPos(e, canvasRef.current);
    ctx.lineTo(x, y); ctx.stroke();
    e.preventDefault();
  };

  const end = () => {
    drawing.current = false;
    setHasSig(true);
    onChange(canvasRef.current.toDataURL());
  };

  const clear = () => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasSig(false);
    onChange(null);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {label && <div style={{ fontSize: 13, color: THEME.textSecondary, marginBottom: 6, fontFamily: THEME.fontFamily }}>{label}</div>}
      <div style={{ fontSize: 11, color: THEME.warning, marginBottom: 6, fontFamily: THEME.fontFamily }}>
        ⚠️ Энэ нь хуулийн дижитал гарын үсэг биш, зөвхөн prototype approval signature болно.
      </div>
      <canvas
        ref={canvasRef} width={300} height={100}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        style={{
          border: `2px dashed ${THEME.border}`, borderRadius: THEME.radiusSm,
          background: THEME.bgInput, cursor: "crosshair", display: "block",
          touchAction: "none",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <Btn onClick={clear} variant="ghost" size="sm">Арилгах</Btn>
        {hasSig && <span style={{ fontSize: 11, color: THEME.success, lineHeight: "28px", fontFamily: THEME.fontFamily }}>✓ Гарын үсэг зурагдсан</span>}
      </div>
    </div>
  );
}

// ============================================================
// SECTION 9: PHOTO UPLOADER
// ============================================================
function PhotoUploader({ photos, onChange }) {
  const handleFile = (e) => {
    Array.from(e.target.files).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const newPhoto = {
          id: newId(), data: ev.target.result, name: file.name,
          description: "", team: "", work: "", location: "",
          timestamp: new Date().toISOString(), uploadedBy: "",
        };
        onChange([...photos, newPhoto]);
      };
      reader.readAsDataURL(file);
    });
  };

  const remove = (id) => onChange(photos.filter(p => p.id !== id));
  const update = (id, field, val) => onChange(photos.map(p => p.id === id ? { ...p, [field]: val } : p));

  return (
    <div>
      <label style={{
        display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
        background: THEME.bgCardHover, border: `1px dashed ${THEME.border}`,
        borderRadius: THEME.radiusSm, padding: "8px 16px", marginBottom: 16,
        fontSize: 13, color: THEME.textSecondary, fontFamily: THEME.fontFamily,
      }}>
        📷 Зураг нэмэх
        <input type="file" accept="image/*" multiple onChange={handleFile} style={{ display: "none" }} />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {photos.map(p => (
          <div key={p.id} style={{ background: THEME.bgInput, borderRadius: THEME.radiusSm, overflow: "hidden", border: `1px solid ${THEME.border}` }}>
            <img src={p.data} alt={p.description || p.name} style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
            <div style={{ padding: 8 }}>
              <input
                value={p.description} placeholder="Тайлбар..."
                onChange={e => update(p.id, "description", e.target.value)}
                style={{ width: "100%", background: "transparent", border: "none", color: THEME.textPrimary, fontSize: 11, fontFamily: THEME.fontFamily, outline: "none", marginBottom: 4, boxSizing: "border-box" }}
              />
              <Btn onClick={() => remove(p.id)} variant="danger" size="sm">Устгах</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// SECTION 10: LOGIN VIEW
// ============================================================
function LoginView() {
  const { setCurrentUser, setActiveView } = useApp();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const login = () => {
    if (!name || !role) return;
    setCurrentUser({ id: newId(), name, role });
    setActiveView("dashboard");
  };

  return (
    <div style={{
      minHeight: "100vh", background: THEME.bg, display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: THEME.fontFamily,
    }}>
      <div style={{
        background: THEME.bgCard, border: `1px solid ${THEME.border}`,
        borderRadius: THEME.radius, padding: 40, width: "100%", maxWidth: 420,
        boxShadow: THEME.shadow,
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏗️</div>
          <h1 style={{ margin: 0, color: THEME.textPrimary, fontSize: 22, fontWeight: 800 }}>Өдөр тутмын тайлан</h1>
          <p style={{ color: THEME.textMuted, fontSize: 13, marginTop: 6 }}>Барилгын удирдлагын систем</p>
          <div style={{ fontSize: 11, color: THEME.warning, marginTop: 8, background: THEME.warning + "15", padding: "6px 12px", borderRadius: 6 }}>
            ⚠️ Prototype / Demo систем — localStorage дээр суурилсан
          </div>
        </div>
        <Input label="Таны нэр" value={name} onChange={setName} placeholder="Нэр оруулах..." required />
        <Select label="Үүрэг / Role" value={role} onChange={setRole} options={ROLES.map(r => ({ value: r.id, label: r.label }))} required />
        <Btn onClick={login} variant="primary" size="lg" disabled={!name || !role} style={{ width: "100%", marginTop: 8 }}>
          Нэвтрэх
        </Btn>
      </div>
    </div>
  );
}

// ============================================================
// SECTION 11: SIDEBAR / NAVIGATION
// ============================================================
function Sidebar({ isMobile }) {
  const { activeView, setActiveView, currentUser, setCurrentUser, alerts } = useApp();

  const navItems = [
    { id: "dashboard", label: "Хяналтын самбар", icon: "📊" },
    { id: "new_report", label: "Шинэ тайлан", icon: "📝" },
    { id: "reports", label: "Тайлангийн жагсаалт", icon: "📋" },
    { id: "archive", label: "Архив", icon: "🗄️" },
    ...(["admin","manager","client"].includes(currentUser?.role) ? [{ id: "approval", label: "Батлах / Хянах", icon: "✅" }] : []),
  ];

  if (isMobile) {
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        background: THEME.bgCard, borderTop: `1px solid ${THEME.border}`,
        display: "flex", justifyContent: "space-around", padding: "8px 0",
      }}>
        {navItems.slice(0, 5).map(n => (
          <button key={n.id} onClick={() => setActiveView(n.id)} style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 8px",
          }}>
            <span style={{ fontSize: 20 }}>{n.icon}</span>
            <span style={{ fontSize: 9, color: activeView === n.id ? THEME.primary : THEME.textMuted, fontFamily: THEME.fontFamily }}>{n.label.slice(0,6)}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      width: 220, minHeight: "100vh", background: THEME.bgCard,
      borderRight: `1px solid ${THEME.border}`, display: "flex",
      flexDirection: "column", padding: "20px 0", flexShrink: 0,
    }}>
      <div style={{ padding: "0 20px 20px", borderBottom: `1px solid ${THEME.border}`, marginBottom: 8 }}>
        <div style={{ fontSize: 24 }}>🏗️</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>Өдөр тутмын тайлан</div>
        <div style={{ fontSize: 11, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>
          {ROLES.find(r => r.id === currentUser?.role)?.label}
        </div>
        <div style={{ fontSize: 12, color: THEME.primary, fontFamily: THEME.fontFamily }}>{currentUser?.name}</div>
      </div>
      {alerts.length > 0 && (
        <div style={{ margin: "8px 12px", background: THEME.danger + "15", borderRadius: 6, padding: "8px 10px", border: `1px solid ${THEME.danger}33` }}>
          <div style={{ fontSize: 11, color: THEME.danger, fontFamily: THEME.fontFamily, fontWeight: 700 }}>🚨 {alerts.length} анхааруулга</div>
        </div>
      )}
      <nav style={{ flex: 1 }}>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setActiveView(n.id)} style={{
            width: "100%", textAlign: "left", background: activeView === n.id ? THEME.primary + "22" : "none",
            border: "none", borderLeft: `3px solid ${activeView === n.id ? THEME.primary : "transparent"}`,
            cursor: "pointer", padding: "11px 20px", display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 16 }}>{n.icon}</span>
            <span style={{ fontSize: 13, color: activeView === n.id ? THEME.primary : THEME.textSecondary, fontFamily: THEME.fontFamily, fontWeight: activeView === n.id ? 700 : 400 }}>{n.label}</span>
          </button>
        ))}
      </nav>
      <div style={{ padding: "16px 20px", borderTop: `1px solid ${THEME.border}` }}>
        <Btn onClick={() => { setCurrentUser(null); LS.remove("cdr_user"); }} variant="ghost" size="sm" style={{ width: "100%" }}>
          Гарах
        </Btn>
      </div>
    </div>
  );
}

// ============================================================
// SECTION 12: DASHBOARD VIEW
// ============================================================
function DashboardView() {
  const { reports, alerts, setActiveView, setCurrentReport, currentUser } = useApp();
  const recent = reports.filter(r => r.status !== "Archived");
  const last7 = recent.slice(-7);

  const totalMH = recent.reduce((s, r) => s + (r.manhours.actualHours || 0), 0);
  const openActions = recent.flatMap(r => r.actionTracker).filter(a => a.status !== "Closed").length;
  const overdueActions = recent.flatMap(r => r.actionTracker).filter(isOverdue).length;
  const approvedCount = reports.filter(r => r.status === "ApprovedByClient" || r.status === "ApprovedByManager").length;
  const returnedCount = reports.filter(r => r.status === "Returned").length;
  const pendingCount = reports.filter(r => ["Submitted","UnderReview"].includes(r.status)).length;

  const chartData = last7.map(r => ({
    label: r.general.date.slice(5),
    value: r.workProgress.length > 0
      ? Math.round(r.workProgress.reduce((s, w) => s + (w.completion || 0), 0) / r.workProgress.length) : 0,
  }));

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, color: THEME.textPrimary, fontFamily: THEME.fontFamily, fontSize: 22 }}>Хяналтын самбар</h2>
          <div style={{ fontSize: 12, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>
            ⚠️ Prototype — зөвхөн энэ browser/device дээр хадгалагдана
          </div>
        </div>
        <Btn onClick={() => setActiveView("new_report")} variant="primary" size="md">+ Шинэ тайлан</Btn>
      </div>

      {alerts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              background: a.level === "red" ? THEME.danger + "15" : THEME.warning + "15",
              border: `1px solid ${a.level === "red" ? THEME.danger : THEME.warning}44`,
              borderRadius: THEME.radiusSm, padding: "10px 16px", marginBottom: 8,
              fontSize: 13, color: a.level === "red" ? THEME.danger : THEME.warning,
              fontFamily: THEME.fontFamily, display: "flex", alignItems: "center", gap: 8,
            }}>
              {a.level === "red" ? "🚨" : "⚠️"} {a.msg}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Нийт тайлан" value={reports.length} icon="📋" color={THEME.primary} />
        <StatCard label="Нийт хүн цаг" value={totalMH} icon="⏱️" color={THEME.accent} />
        <StatCard label="Нээлттэй action" value={openActions} sub={`${overdueActions} хугацаа хэтэрсэн`} icon="📌" color={overdueActions > 0 ? THEME.danger : THEME.success} />
        <StatCard label="Батлагдсан" value={approvedCount} icon="✅" color={THEME.success} />
        <StatCard label="Хянагдаж байна" value={pendingCount} icon="🔍" color={THEME.warning} />
        <StatCard label="Буцаагдсан" value={returnedCount} icon="↩️" color={THEME.danger} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <Card title="Сүүлийн 7 хоногийн биелэлт %">
          <BarChart data={chartData} />
        </Card>
        <Card title="Тайлангийн статус">
          <DonutChart segments={[
            { label: "Батлагдсан", value: approvedCount, color: THEME.success },
            { label: "Хянагдаж байна", value: pendingCount, color: THEME.warning },
            { label: "Буцаагдсан", value: returnedCount, color: THEME.danger },
            { label: "Ноорог", value: reports.filter(r=>r.status==="Draft").length, color: THEME.textMuted },
          ]} />
        </Card>
      </div>

      {recent.length > 0 && (
        <Card title="Сүүлийн тайлангууд">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: THEME.fontFamily, fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  {["Дугаар","Огноо","Төсөл","Биелэлт","Статус","Үйлдэл"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: THEME.textMuted, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.slice(-5).reverse().map(r => {
                  const avgP = r.workProgress.length > 0
                    ? Math.round(r.workProgress.reduce((s,w)=>s+(w.completion||0),0)/r.workProgress.length) : 0;
                  const st = REPORT_STATUSES[r.status];
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${THEME.border}22` }}>
                      <td style={{ padding: "8px 10px", color: THEME.textSecondary }}>{r.id}</td>
                      <td style={{ padding: "8px 10px", color: THEME.textPrimary }}>{r.general.date}</td>
                      <td style={{ padding: "8px 10px", color: THEME.textPrimary }}>{r.general.project || "—"}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 60 }}><ProgressBar value={avgP} /></div>
                          <span style={{ fontSize: 12, color: THEME.textSecondary }}>{avgP}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "8px 10px" }}><Badge label={st?.label} color={st?.color || THEME.textMuted} /></td>
                      <td style={{ padding: "8px 10px" }}>
                        <Btn onClick={() => { setCurrentReport(r); setActiveView("report_detail"); }} variant="ghost" size="sm">Харах</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {recent.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Одоохондоо тайлан байхгүй байна</div>
          <Btn onClick={() => setActiveView("new_report")} variant="primary">Эхний тайлан үүсгэх</Btn>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SECTION 13: REPORT FORM — STEP COMPONENTS
// ============================================================
function StepGeneral({ data, onChange }) {
  const f = (field) => (val) => onChange({ ...data, [field]: val });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Input label="Огноо" value={data.date} onChange={f("date")} type="date" required />
      <Input label="Гэрээний дугаар" value={data.contract} onChange={f("contract")} />
      <Input label="Төслийн нэр" value={data.project} onChange={f("project")} required style={{ gridColumn: "1 / -1" }} />
      <Input label="WBS / Activity code" value={data.wbs} onChange={f("wbs")} />
      <Input label="Байршил" value={data.location} onChange={f("location")} required />
      <Input label="Барилгын zone" value={data.zone} onChange={f("zone")} />
      <Input label="Давхар / Level" value={data.floor} onChange={f("floor")} />
      <Input label="Gridline / Area" value={data.gridline} onChange={f("gridline")} />
      <Input label="Захиалагч" value={data.client} onChange={f("client")} />
      <Input label="Гүйцэтгэгч" value={data.contractor} onChange={f("contractor")} />
      <Input label="Туслан гүйцэтгэгч" value={data.subcontractor} onChange={f("subcontractor")} />
      <Input label="Тайлан бэлтгэсэн" value={data.preparedBy} onChange={f("preparedBy")} required />
      <Select label="Цаг агаар" value={data.weather} onChange={f("weather")} options={["Цэлмэг","Үүлэрхэг","Борооны","Цастай","Салхитай","Манан"]} />
      <Input label="Температур (°C)" value={data.temp} onChange={f("temp")} type="number" />
      <Input label="Салхины хурд" value={data.wind} onChange={f("wind")} />
      <Input label="Хур тунадас" value={data.precipitation} onChange={f("precipitation")} />
      <Select label="Ажлын ээлж" value={data.shift} onChange={f("shift")} options={["Өдөр","Шөнө","Өдөр+Шөнө"]} />
      <Input label="Эхэлсэн цаг" value={data.startTime} onChange={f("startTime")} type="time" />
      <Input label="Дууссан цаг" value={data.endTime} onChange={f("endTime")} type="time" />
    </div>
  );
}

function StepManhours({ data, onChange }) {
  const f = (field) => (val) => onChange({ ...data, [field]: parseFloat(val)||0 });
  const total = (data.actualHours||0) + (data.overtime||0);
  const variance = (data.actualHours||0) - (data.plannedHours||0);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Input label="Төлөвлөгөөт ажилчид" value={data.plannedWorkers} onChange={f("plannedWorkers")} type="number" min="0" />
        <Input label="Бодит ажилчид" value={data.actualWorkers} onChange={f("actualWorkers")} type="number" min="0" />
        <Input label="Төлөвлөгөөт хүн цаг" value={data.plannedHours} onChange={f("plannedHours")} type="number" min="0" />
        <Input label="Бодит хүн цаг" value={data.actualHours} onChange={f("actualHours")} type="number" min="0" />
        <Input label="Илүү цаг" value={data.overtime} onChange={f("overtime")} type="number" min="0" />
        <Input label="Сул зогсолтын цаг" value={data.idleHours} onChange={f("idleHours")} type="number" min="0" />
      </div>
      <Card style={{ background: THEME.bgInput }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontFamily: THEME.fontFamily }}>
          <div><div style={{ fontSize: 11, color: THEME.textMuted }}>Нийт хүн цаг</div><div style={{ fontSize: 20, fontWeight: 800, color: THEME.primary }}>{total}</div></div>
          <div><div style={{ fontSize: 11, color: THEME.textMuted }}>Зөрүү</div><div style={{ fontSize: 20, fontWeight: 800, color: variance >= 0 ? THEME.success : THEME.danger }}>{variance >= 0 ? "+" : ""}{variance}</div></div>
          <div><div style={{ fontSize: 11, color: THEME.textMuted }}>Гүйцэтгэл %</div><div style={{ fontSize: 20, fontWeight: 800, color: THEME.accent }}>{data.plannedHours > 0 ? Math.round((data.actualHours/data.plannedHours)*100) : 0}%</div></div>
        </div>
      </Card>
    </div>
  );
}

function StepWorkProgress({ data, onChange }) {
  const add = () => onChange([...data, { id: newId(), name: "", location: "", quantity: 0, unit: "м²", completion: 0, team: "", delayReason: "", delayType: "", notes: "" }]);
  const update = (id, field, val) => onChange(data.map(w => w.id === id ? { ...w, [field]: val } : w));
  const remove = (id) => onChange(data.filter(w => w.id !== id));

  return (
    <div>
      <Btn onClick={add} variant="secondary" size="sm" style={{ marginBottom: 16 }}>+ Ажил нэмэх</Btn>
      {data.length === 0 && <div style={{ color: THEME.textMuted, fontFamily: THEME.fontFamily, fontSize: 13, textAlign: "center", padding: 20 }}>Ажил бүртгэгдэхгүй байна. "+ Ажил нэмэх" дарна уу.</div>}
      {data.map((w, i) => (
        <Card key={w.id} style={{ background: THEME.bgInput, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <strong style={{ color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>Ажил #{i+1}</strong>
            <Btn onClick={() => remove(w.id)} variant="danger" size="sm">Устгах</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Input label="Ажлын нэр" value={w.name} onChange={v => update(w.id,"name",v)} />
            <Input label="Байршил" value={w.location} onChange={v => update(w.id,"location",v)} />
            <Input label="Тоо хэмжээ" value={w.quantity} onChange={v => update(w.id,"quantity",parseFloat(v)||0)} type="number" />
            <Input label="Нэгж" value={w.unit} onChange={v => update(w.id,"unit",v)} />
            <Input label="Хариуцсан баг" value={w.team} onChange={v => update(w.id,"team",v)} />
            <div>
              <label style={{ fontSize: 12, color: THEME.textSecondary, display: "block", marginBottom: 4, fontFamily: THEME.fontFamily }}>Биелэлт %</label>
              <input type="range" min="0" max="100" value={w.completion}
                onChange={e => update(w.id,"completion",parseInt(e.target.value))}
                style={{ width: "100%", accentColor: w.completion >= 90 ? THEME.success : w.completion >= 70 ? THEME.warning : THEME.danger }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <ProgressBar value={w.completion} />
                <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 700, color: w.completion >= 90 ? THEME.success : w.completion >= 70 ? THEME.warning : THEME.danger, fontFamily: THEME.fontFamily }}>{w.completion}%</span>
              </div>
            </div>
          </div>
          <Select label="Саатлын төрөл" value={w.delayType} onChange={v => update(w.id,"delayType",v)} options={DELAY_CATEGORIES} />
          <Textarea label="Саатлын шалтгаан / тэмдэглэл" value={w.notes} onChange={v => update(w.id,"notes",v)} rows={2} />
        </Card>
      ))}
    </div>
  );
}

function StepTeams({ data, onChange }) {
  const add = () => onChange([...data, { id: newId(), teamType: "", lead: "", workers: 0, plannedHours: 0, actualHours: 0, completedWork: "", inProgressWork: "", completion: 0, delayReason: "", tomorrowTarget: "", notes: "" }]);
  const update = (id, field, val) => onChange(data.map(t => t.id === id ? { ...t, [field]: val } : t));
  const remove = (id) => onChange(data.filter(t => t.id !== id));

  return (
    <div>
      <Btn onClick={add} variant="secondary" size="sm" style={{ marginBottom: 16 }}>+ Баг нэмэх</Btn>
      {data.map((t, i) => (
        <Card key={t.id} style={{ background: THEME.bgInput, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <strong style={{ color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>Баг #{i+1}</strong>
            <Btn onClick={() => remove(t.id)} variant="danger" size="sm">Устгах</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Select label="Багийн нэр" value={t.teamType} onChange={v => update(t.id,"teamType",v)} options={TEAM_TYPES} />
            <Input label="Ахлагч" value={t.lead} onChange={v => update(t.id,"lead",v)} />
            <Input label="Ажилчдын тоо" value={t.workers} onChange={v => update(t.id,"workers",parseInt(v)||0)} type="number" min="0" />
            <Input label="Төлөвлөгөөт хүн цаг" value={t.plannedHours} onChange={v => update(t.id,"plannedHours",parseFloat(v)||0)} type="number" min="0" />
            <Input label="Бодит хүн цаг" value={t.actualHours} onChange={v => update(t.id,"actualHours",parseFloat(v)||0)} type="number" min="0" />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: "column" }}>
              <label style={{ fontSize: 12, color: THEME.textSecondary, fontFamily: THEME.fontFamily, alignSelf: "start" }}>Биелэлт %</label>
              <input type="number" min="0" max="100" value={t.completion} onChange={e => update(t.id,"completion",parseInt(e.target.value)||0)}
                style={{ width: "100%", background: THEME.bgInput, border: `1px solid ${THEME.border}`, borderRadius: THEME.radiusSm, color: THEME.textPrimary, padding: "8px 12px", fontFamily: THEME.fontFamily, fontSize: 14 }}
              />
            </div>
          </div>
          <Textarea label="Гүйцэтгэсэн ажил" value={t.completedWork} onChange={v => update(t.id,"completedWork",v)} rows={2} />
          <Textarea label="Хийгдэж буй ажил" value={t.inProgressWork} onChange={v => update(t.id,"inProgressWork",v)} rows={2} />
          <Input label="Саатлын шалтгаан" value={t.delayReason} onChange={v => update(t.id,"delayReason",v)} />
          <Input label="Маргаашийн зорилт" value={t.tomorrowTarget} onChange={v => update(t.id,"tomorrowTarget",v)} />
        </Card>
      ))}
    </div>
  );
}

function StepHSE({ data, onChange }) {
  const f = (field) => (val) => onChange({ ...data, [field]: val });
  const fn = (field) => (val) => onChange({ ...data, [field]: parseFloat(val)||0 });
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Input label="Өнөөдрийн хүн цаг" value={data.manhoursToday} onChange={fn("manhoursToday")} type="number" min="0" />
        <Input label="Хуримтлагдсан хүн цаг" value={data.cumulativeMH} onChange={fn("cumulativeMH")} type="number" min="0" />
      </div>
      <Card style={{ background: THEME.bgInput, marginBottom: 12 }}>
        <Checkbox label="Toolbox Talk хийсэн" checked={data.toolboxTalk} onChange={f("toolboxTalk")} />
        {data.toolboxTalk && <>
          <Input label="Toolbox Talk сэдэв" value={data.toolboxTopic} onChange={f("toolboxTopic")} />
          <Input label="Оролцсон хүний тоо" value={data.toolboxParticipants} onChange={fn("toolboxParticipants")} type="number" min="0" />
        </>}
      </Card>
      <Card title="Аюулгүй байдлын статистик" style={{ background: THEME.bgInput }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
          <Input label="LTI" value={data.lti} onChange={fn("lti")} type="number" min="0" />
          <Input label="MTC" value={data.mtc} onChange={fn("mtc")} type="number" min="0" />
          <Input label="FAC" value={data.fac} onChange={fn("fac")} type="number" min="0" />
          <Input label="Near Miss" value={data.nearMiss} onChange={fn("nearMiss")} type="number" min="0" />
          <Input label="Incident" value={data.incident} onChange={fn("incident")} type="number" min="0" />
          <Input label="Unsafe Act" value={data.unsafeAct} onChange={fn("unsafeAct")} type="number" min="0" />
          <Input label="Unsafe Condition" value={data.unsafeCondition} onChange={fn("unsafeCondition")} type="number" min="0" />
          <Input label="PPE Compliance %" value={data.ppeCompliance} onChange={fn("ppeCompliance")} type="number" min="0" max="100" />
          <Input label="HSE Inspection" value={data.hseInspection} onChange={fn("hseInspection")} type="number" min="0" />
        </div>
      </Card>
      <Card style={{ background: THEME.bgInput }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          <Checkbox label="Stop Work issued" checked={data.stopWork} onChange={f("stopWork")} />
          <Checkbox label="Working at Height" checked={data.workAtHeight} onChange={f("workAtHeight")} />
          <Checkbox label="Lifting Operation" checked={data.liftingOp} onChange={f("liftingOp")} />
          <Checkbox label="Hot Work" checked={data.hotWork} onChange={f("hotWork")} />
          <Checkbox label="Confined Space" checked={data.confinedSpace} onChange={f("confinedSpace")} />
        </div>
        <Input label="Permit to Work" value={data.permitToWork} onChange={f("permitToWork")} />
        <Input label="Corrective Actions raised" value={data.correctiveRaised} onChange={fn("correctiveRaised")} type="number" min="0" />
        <Input label="Corrective Actions closed" value={data.correctiveClosed} onChange={fn("correctiveClosed")} type="number" min="0" />
      </Card>
      <Textarea label="HSE тэмдэглэл" value={data.notes} onChange={f("notes")} rows={3} />
    </div>
  );
}

function StepQAQC({ data, onChange }) {
  const f = (field) => (val) => onChange({ ...data, [field]: val });
  return (
    <div>
      <Checkbox label="Inspection хийсэн" checked={data.inspectionDone} onChange={f("inspectionDone")} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Input label="Inspection Request Number" value={data.irn} onChange={f("irn")} />
        <Input label="Checklist Reference" value={data.checklistRef} onChange={f("checklistRef")} />
        <Input label="ITP Reference" value={data.itpRef} onChange={f("itpRef")} />
        <Select label="Inspection үр дүн" value={data.result} onChange={f("result")} options={["Accepted","Rejected","Accepted with comment"]} />
        <Input label="NCR Number" value={data.ncrNumber} onChange={f("ncrNumber")} />
        <Input label="RFI Number" value={data.rfiNumber} onChange={f("rfiNumber")} />
        <Input label="Drawing Number" value={data.drawingNumber} onChange={f("drawingNumber")} />
        <Input label="Revision" value={data.revision} onChange={f("revision")} />
        <Input label="Хариуцсан ажилтан" value={data.responsiblePerson} onChange={f("responsiblePerson")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <Checkbox label="Hold Point" checked={data.holdPoint} onChange={f("holdPoint")} />
        <Checkbox label="Witness Point" checked={data.witnessPoint} onChange={f("witnessPoint")} />
        <Checkbox label="Defect / Rework" checked={data.defect} onChange={f("defect")} />
        <Checkbox label="Rework Required" checked={data.reworkRequired} onChange={f("reworkRequired")} />
      </div>
      <Textarea label="QA/QC тэмдэглэл" value={data.notes} onChange={f("notes")} rows={3} />
    </div>
  );
}

function StepEquipment({ data, onChange }) {
  const add = () => onChange([...data, { id: newId(), name: "", equipmentId: "", status: "Ажиллаж байгаа", workHours: 0, idleHours: 0, breakdownReason: "", operator: "", notes: "" }]);
  const update = (id, field, val) => onChange(data.map(e => e.id === id ? { ...e, [field]: val } : e));
  const remove = (id) => onChange(data.filter(e => e.id !== id));
  return (
    <div>
      <Btn onClick={add} variant="secondary" size="sm" style={{ marginBottom: 16 }}>+ Тоног төхөөрөмж нэмэх</Btn>
      {data.map((e, i) => (
        <Card key={e.id} style={{ background: THEME.bgInput, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong style={{ color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>#{i+1} {e.name || "Тоног төхөөрөмж"}</strong>
            <Btn onClick={() => remove(e.id)} variant="danger" size="sm">Устгах</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Input label="Нэр" value={e.name} onChange={v => update(e.id,"name",v)} />
            <Input label="Дугаар / ID" value={e.equipmentId} onChange={v => update(e.id,"equipmentId",v)} />
            <Select label="Төлөв" value={e.status} onChange={v => update(e.id,"status",v)} options={EQUIPMENT_STATUSES} />
            <Input label="Operator" value={e.operator} onChange={v => update(e.id,"operator",v)} />
            <Input label="Ажилласан цаг" value={e.workHours} onChange={v => update(e.id,"workHours",parseFloat(v)||0)} type="number" min="0" />
            <Input label="Сул зогсолтын цаг" value={e.idleHours} onChange={v => update(e.id,"idleHours",parseFloat(v)||0)} type="number" min="0" />
          </div>
          {e.status === "Эвдэрсэн" && <Input label="Эвдрэлийн шалтгаан" value={e.breakdownReason} onChange={v => update(e.id,"breakdownReason",v)} />}
        </Card>
      ))}
    </div>
  );
}

function StepMaterials({ data, onChange }) {
  const add = () => onChange([...data, { id: newId(), name: "", unit: "", planned: 0, actual: 0, received: 0, remaining: 0, issue: "", notes: "" }]);
  const update = (id, field, val) => onChange(data.map(m => m.id === id ? { ...m, [field]: val } : m));
  const remove = (id) => onChange(data.filter(m => m.id !== id));
  return (
    <div>
      <Btn onClick={add} variant="secondary" size="sm" style={{ marginBottom: 16 }}>+ Материал нэмэх</Btn>
      {data.map((m, i) => {
        const variance = (m.actual||0) - (m.planned||0);
        return (
          <Card key={m.id} style={{ background: THEME.bgInput, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>#{i+1} {m.name || "Материал"}</strong>
              <Btn onClick={() => remove(m.id)} variant="danger" size="sm">Устгах</Btn>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              <Input label="Нэр" value={m.name} onChange={v => update(m.id,"name",v)} />
              <Input label="Нэгж" value={m.unit} onChange={v => update(m.id,"unit",v)} />
              <Input label="Төлөвлөгөөт" value={m.planned} onChange={v => update(m.id,"planned",parseFloat(v)||0)} type="number" min="0" />
              <Input label="Бодит зарцуулалт" value={m.actual} onChange={v => update(m.id,"actual",parseFloat(v)||0)} type="number" min="0" />
              <Input label="Ирсэн материал" value={m.received} onChange={v => update(m.id,"received",parseFloat(v)||0)} type="number" min="0" />
              <Input label="Үлдэгдэл" value={m.remaining} onChange={v => update(m.id,"remaining",parseFloat(v)||0)} type="number" min="0" />
            </div>
            <div style={{ fontSize: 13, fontFamily: THEME.fontFamily, color: variance > 0 ? THEME.danger : variance < 0 ? THEME.success : THEME.textMuted, marginBottom: 8 }}>
              Зөрүү: {variance > 0 ? "+" : ""}{variance} {m.unit}
            </div>
            <Input label="Материалын асуудал" value={m.issue} onChange={v => update(m.id,"issue",v)} />
          </Card>
        );
      })}
    </div>
  );
}

function StepCosts({ data, onChange }) {
  const f = (field) => (val) => onChange({ ...data, [field]: parseFloat(val)||0 });
  const total = (data.labor||0)+(data.equipment||0)+(data.material||0)+(data.transport||0)+(data.other||0);
  const variance = total - (data.plannedTotal||0);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Input label="Хөдөлмөрийн зардал (₮)" value={data.labor} onChange={f("labor")} type="number" min="0" />
        <Input label="Тоног төхөөрөмжийн зардал (₮)" value={data.equipment} onChange={f("equipment")} type="number" min="0" />
        <Input label="Материалын зардал (₮)" value={data.material} onChange={f("material")} type="number" min="0" />
        <Input label="Тээврийн зардал (₮)" value={data.transport} onChange={f("transport")} type="number" min="0" />
        <Input label="Бусад зардал (₮)" value={data.other} onChange={f("other")} type="number" min="0" />
        <Input label="Төлөвлөгөөт нийт зардал (₮)" value={data.plannedTotal} onChange={f("plannedTotal")} type="number" min="0" />
      </div>
      <Card style={{ background: THEME.bgInput }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontFamily: THEME.fontFamily }}>
          <div>
            <div style={{ fontSize: 11, color: THEME.textMuted }}>Нийт бодит зардал</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: THEME.primary }}>₮{total.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: THEME.textMuted }}>Төлөвлөгөөтэй зөрүү</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: variance > 0 ? THEME.danger : THEME.success }}>
              {variance > 0 ? "+" : ""}₮{variance.toLocaleString()}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function StepActionTracker({ data, onChange }) {
  const add = () => onChange([...data, { id: `ACT-${Date.now()}`, description: "", source: "", responsible: "", dueDate: "", priority: "Дунд", status: "Open", carriedOver: false }]);
  const update = (id, field, val) => onChange(data.map(a => a.id === id ? { ...a, [field]: val } : a));
  const remove = (id) => onChange(data.filter(a => a.id !== id));

  return (
    <div>
      <Btn onClick={add} variant="secondary" size="sm" style={{ marginBottom: 16 }}>+ Action нэмэх</Btn>
      {data.length === 0 && <div style={{ color: THEME.textMuted, fontFamily: THEME.fontFamily, fontSize: 13, textAlign: "center", padding: 20 }}>Action бүртгэгдэхгүй байна</div>}
      {data.map((a, i) => {
        const od = isOverdue(a);
        return (
          <Card key={a.id} style={{ background: od ? THEME.danger + "10" : THEME.bgInput, border: `1px solid ${od ? THEME.danger : THEME.border}`, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>{a.id}</span>
                {od && <Badge label="Хугацаа хэтэрсэн" color={THEME.danger} />}
                {a.carriedOver && <Badge label="Өмнөх өдрөөс" color={THEME.warning} />}
              </div>
              <Btn onClick={() => remove(a.id)} variant="danger" size="sm">Устгах</Btn>
            </div>
            <Textarea label="Тайлбар" value={a.description} onChange={v => update(a.id,"description",v)} rows={2} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
              <Select label="Эх сурвалж" value={a.source} onChange={v => update(a.id,"source",v)} options={ACTION_SOURCES} />
              <Select label="Ач холбогдол" value={a.priority} onChange={v => update(a.id,"priority",v)} options={PRIORITIES} />
              <Select label="Статус" value={a.status} onChange={v => update(a.id,"status",v)} options={ACTION_STATUSES} />
              <Input label="Хариуцагч" value={a.responsible} onChange={v => update(a.id,"responsible",v)} />
              <Input label="Дуусгах огноо" value={a.dueDate} onChange={v => update(a.id,"dueDate",v)} type="date" />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function StepTomorrowPlan({ data, onChange, notes, onNotesChange, visitors, onVisitorsChange }) {
  const addPlan = () => onChange([...data, { id: newId(), work: "", team: "", manpower: 0, materials: "", equipment: "", risk: "", priority: "Дунд" }]);
  const updatePlan = (id, field, val) => onChange(data.map(p => p.id === id ? { ...p, [field]: val } : p));
  const removePlan = (id) => onChange(data.filter(p => p.id !== id));

  const addVisitor = () => onVisitorsChange([...visitors, { id: newId(), name: "", org: "", position: "", arrival: "", departure: "", purpose: "", hseInduction: false }]);
  const updateVisitor = (id, field, val) => onVisitorsChange(visitors.map(v => v.id === id ? { ...v, [field]: val } : v));
  const removeVisitor = (id) => onVisitorsChange(visitors.filter(v => v.id !== id));

  return (
    <div>
      <h4 style={{ color: THEME.textPrimary, fontFamily: THEME.fontFamily, marginBottom: 12 }}>Маргаашийн зорилтууд</h4>
      <Btn onClick={addPlan} variant="secondary" size="sm" style={{ marginBottom: 12 }}>+ Зорилт нэмэх</Btn>
      {data.map((p, i) => (
        <Card key={p.id} style={{ background: THEME.bgInput, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong style={{ fontFamily: THEME.fontFamily, color: THEME.textPrimary }}>Зорилт #{i+1}</strong>
            <Btn onClick={() => removePlan(p.id)} variant="danger" size="sm">Устгах</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Input label="Хийх ажил" value={p.work} onChange={v => updatePlan(p.id,"work",v)} />
            <Input label="Хариуцсан баг" value={p.team} onChange={v => updatePlan(p.id,"team",v)} />
            <Input label="Хүн хүч" value={p.manpower} onChange={v => updatePlan(p.id,"manpower",parseInt(v)||0)} type="number" />
            <Select label="Ач холбогдол" value={p.priority} onChange={v => updatePlan(p.id,"priority",v)} options={PRIORITIES} />
            <Input label="Шаардлагатай материал" value={p.materials} onChange={v => updatePlan(p.id,"materials",v)} />
            <Input label="Тоног төхөөрөмж" value={p.equipment} onChange={v => updatePlan(p.id,"equipment",v)} />
          </div>
          <Input label="Эрсдэл / анхаарах зүйл" value={p.risk} onChange={v => updatePlan(p.id,"risk",v)} />
        </Card>
      ))}

      <h4 style={{ color: THEME.textPrimary, fontFamily: THEME.fontFamily, margin: "20px 0 12px" }}>Зочдын бүртгэл</h4>
      <Btn onClick={addVisitor} variant="secondary" size="sm" style={{ marginBottom: 12 }}>+ Зочин нэмэх</Btn>
      {visitors.map((v, i) => (
        <Card key={v.id} style={{ background: THEME.bgInput, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong style={{ fontFamily: THEME.fontFamily, color: THEME.textPrimary }}>Зочин #{i+1}</strong>
            <Btn onClick={() => removeVisitor(v.id)} variant="danger" size="sm">Устгах</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Input label="Нэр" value={v.name} onChange={val => updateVisitor(v.id,"name",val)} />
            <Input label="Байгууллага" value={v.org} onChange={val => updateVisitor(v.id,"org",val)} />
            <Input label="Албан тушаал" value={v.position} onChange={val => updateVisitor(v.id,"position",val)} />
            <Input label="Зорилго" value={v.purpose} onChange={val => updateVisitor(v.id,"purpose",val)} />
            <Input label="Ирсэн цаг" value={v.arrival} onChange={val => updateVisitor(v.id,"arrival",val)} type="time" />
            <Input label="Явсан цаг" value={v.departure} onChange={val => updateVisitor(v.id,"departure",val)} type="time" />
          </div>
          <Checkbox label="HSE Induction хийсэн" checked={v.hseInduction} onChange={val => updateVisitor(v.id,"hseInduction",val)} />
        </Card>
      ))}

      <h4 style={{ color: THEME.textPrimary, fontFamily: THEME.fontFamily, margin: "20px 0 12px" }}>Тэмдэглэл / Санамж</h4>
      <Textarea label="Ерөнхий тэмдэглэл" value={notes.general} onChange={v => onNotesChange({ ...notes, general: v })} rows={3} />
      <Textarea label="Захиалагчид мэдэгдэх асуудал" value={notes.clientNotice} onChange={v => onNotesChange({ ...notes, clientNotice: v })} rows={2} />
      <Textarea label="Менежментэд escalation" value={notes.escalation} onChange={v => onNotesChange({ ...notes, escalation: v })} rows={2} />
      <Textarea label="Follow-up action" value={notes.followUp} onChange={v => onNotesChange({ ...notes, followUp: v })} rows={2} />
    </div>
  );
}

function StepSignatures({ signatures, onChange }) {
  const roles = [
    { key: "prepared", label: "Бэлтгэсэн" },
    { key: "reviewed", label: "Хянасан" },
    { key: "approved", label: "Баталсан" },
    { key: "clientApproved", label: "Захиалагч баталсан" },
  ];
  const updateSig = (key, field, val) => {
    onChange({ ...signatures, [key]: { ...(signatures[key] || {}), [field]: val } });
  };
  return (
    <div>
      <div style={{ fontSize: 12, color: THEME.warning, marginBottom: 16, fontFamily: THEME.fontFamily, background: THEME.warning + "15", padding: "10px 14px", borderRadius: THEME.radiusSm }}>
        ⚠️ Энэ нь хуулийн дижитал гарын үсэг биш, зөвхөн prototype approval signature болно. Production системд хуулийн дижитал гарын үсгийн шийдэл шаардагдана.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {roles.map(r => (
          <Card key={r.key} style={{ background: THEME.bgInput }}>
            <h4 style={{ margin: "0 0 12px", color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>{r.label}</h4>
            <Input label="Нэр" value={signatures[r.key]?.name || ""} onChange={v => updateSig(r.key,"name",v)} />
            <Input label="Албан тушаал" value={signatures[r.key]?.position || ""} onChange={v => updateSig(r.key,"position",v)} />
            <Input label="Огноо" value={signatures[r.key]?.date || ""} onChange={v => updateSig(r.key,"date",v)} type="date" />
            <SignatureCanvas
              value={signatures[r.key]?.canvasData}
              onChange={v => updateSig(r.key,"canvasData",v)}
              label="Гарын үсэг"
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// SECTION 14: NEW REPORT / EDIT REPORT FORM
// ============================================================
const FORM_STEPS = [
  { label: "Ерөнхий мэдээлэл", icon: "📋" },
  { label: "Хүн цаг", icon: "⏱️" },
  { label: "Ажлын биелэлт", icon: "📈" },
  { label: "Багийн мэдээлэл", icon: "👷" },
  { label: "HSE", icon: "🦺" },
  { label: "QA/QC", icon: "🔍" },
  { label: "Тоног / Материал / Зардал", icon: "🔧" },
  { label: "Action Tracker", icon: "📌" },
  { label: "Маргааш / Зочид / Тэмдэглэл", icon: "📅" },
  { label: "Зураг", icon: "📷" },
  { label: "Гарын үсэг", icon: "✍️" },
];

function NewReportView() {
  const { currentUser, reports, saveReport, showToast, setActiveView, currentReport, setCurrentReport } = useApp();
  const [step, setStep] = useState(0);
  const [report, setReport] = useState(() => currentReport && currentReport.status === "Draft" ? currentReport : newReport(currentUser));
  const [showCarryOver, setShowCarryOver] = useState(false);
  const [errors, setErrors] = useState([]);

  const u = (field) => (val) => setReport(r => ({ ...r, [field]: val }));

  const completeness = calcCompleteness(report);

  const handleSaveDraft = () => {
    const saved = saveReport(report);
    setReport(saved);
    showToast("Ноорог хадгаллаа ✓");
  };

  const handleSubmit = () => {
    const errs = validateReport(report);
    if (errs.length > 0) { setErrors(errs); return; }
    if (completeness < 80) {
      if (!window.confirm(`Тайлангийн бүрэн байдал ${completeness}% байна. Илгээх үү?`)) return;
    }
    const submitted = {
      ...report,
      status: "Submitted",
      auditTrail: [...report.auditTrail, {
        id: newId(), actor: currentUser.name, role: currentUser.role,
        action: "Тайлан илгээсэн", timestamp: new Date().toISOString(),
        comment: "", fromStatus: "Draft", toStatus: "Submitted",
      }],
    };
    saveReport(submitted);
    showToast("Тайлан амжилттай илгээгдлээ ✓", "success");
    setCurrentReport(null);
    setActiveView("reports");
  };

  const handleCarryOver = () => {
    const prev = reports.filter(r => r.general.project).sort((a,b) => b.general.date.localeCompare(a.general.date))[0];
    if (!prev) { showToast("Өмнөх тайлан байхгүй байна", "warning"); return; }
    const carried = carryOver(prev, new Date().toISOString().slice(0,10), currentUser);
    setReport(carried);
    setShowCarryOver(false);
    showToast("Өмнөх өдрийн мэдээлэл татагдлаа ✓");
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>{currentReport?.status === "Draft" ? "Тайлан засах" : "Шинэ тайлан"}</h2>
          <div style={{ fontSize: 12, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>{report.id}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 13, color: completeness >= 80 ? THEME.success : THEME.warning, fontFamily: THEME.fontFamily, fontWeight: 700 }}>
            {completeness}% бүрэн
          </div>
          <Btn onClick={() => setShowCarryOver(true)} variant="secondary" size="sm">↩ Өмнөх өдрөөс татах</Btn>
          <Btn onClick={handleSaveDraft} variant="ghost" size="sm">💾 Хадгалах</Btn>
        </div>
      </div>

      {errors.length > 0 && (
        <div style={{ background: THEME.danger + "15", border: `1px solid ${THEME.danger}44`, borderRadius: THEME.radiusSm, padding: "12px 16px", marginBottom: 16 }}>
          {errors.map((e,i) => <div key={i} style={{ fontSize: 13, color: THEME.danger, fontFamily: THEME.fontFamily }}>• {e}</div>)}
        </div>
      )}

      {/* Step nav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {FORM_STEPS.map((s, i) => (
          <button key={i} onClick={() => setStep(i)} style={{
            background: step === i ? THEME.primary : THEME.bgInput,
            border: `1px solid ${step === i ? THEME.primary : THEME.border}`,
            borderRadius: THEME.radiusSm, padding: "6px 10px", cursor: "pointer",
            fontSize: 11, color: step === i ? "#fff" : THEME.textMuted, fontFamily: THEME.fontFamily,
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      <Card>
        <h3 style={{ margin: "0 0 16px", color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>{FORM_STEPS[step].icon} {FORM_STEPS[step].label}</h3>
        {step === 0 && <StepGeneral data={report.general} onChange={u("general")} />}
        {step === 1 && <StepManhours data={report.manhours} onChange={u("manhours")} />}
        {step === 2 && <StepWorkProgress data={report.workProgress} onChange={u("workProgress")} />}
        {step === 3 && <StepTeams data={report.teams} onChange={u("teams")} />}
        {step === 4 && <StepHSE data={report.hse} onChange={u("hse")} />}
        {step === 5 && <StepQAQC data={report.qaqc} onChange={u("qaqc")} />}
        {step === 6 && (
          <div>
            <h4 style={{ color: THEME.textSecondary, fontFamily: THEME.fontFamily, marginBottom: 12 }}>Тоног төхөөрөмж</h4>
            <StepEquipment data={report.equipment} onChange={u("equipment")} />
            <h4 style={{ color: THEME.textSecondary, fontFamily: THEME.fontFamily, margin: "20px 0 12px" }}>Материал</h4>
            <StepMaterials data={report.materials} onChange={u("materials")} />
            <h4 style={{ color: THEME.textSecondary, fontFamily: THEME.fontFamily, margin: "20px 0 12px" }}>Зардал</h4>
            <StepCosts data={report.costs} onChange={u("costs")} />
          </div>
        )}
        {step === 7 && <StepActionTracker data={report.actionTracker} onChange={u("actionTracker")} />}
        {step === 8 && (
          <StepTomorrowPlan
            data={report.tomorrowPlan} onChange={u("tomorrowPlan")}
            notes={report.notes} onNotesChange={u("notes")}
            visitors={report.visitors} onVisitorsChange={u("visitors")}
          />
        )}
        {step === 9 && <PhotoUploader photos={report.photos} onChange={u("photos")} />}
        {step === 10 && <StepSignatures signatures={report.signatures} onChange={u("signatures")} />}
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <Btn onClick={() => setStep(s => Math.max(0, s-1))} variant="secondary" disabled={step === 0}>← Өмнөх</Btn>
        <div style={{ display: "flex", gap: 8 }}>
          {step === FORM_STEPS.length - 1 ? (
            <>
              <Btn onClick={handleSaveDraft} variant="ghost">💾 Ноорог хадгалах</Btn>
              <Btn onClick={handleSubmit} variant="success">📤 Тайлан илгээх</Btn>
            </>
          ) : (
            <Btn onClick={() => setStep(s => Math.min(FORM_STEPS.length-1, s+1))} variant="primary">Дараах →</Btn>
          )}
        </div>
      </div>

      {showCarryOver && (
        <Modal title="Өмнөх өдрөөс мэдээлэл татах" onClose={() => setShowCarryOver(false)}>
          <p style={{ color: THEME.textSecondary, fontFamily: THEME.fontFamily, fontSize: 14 }}>
            Сүүлийн тайлангаас дараах мэдээллийг татна: төслийн мэдээлэл, багийн жагсаалт, хаагдаагүй action-ууд, хийгдэж буй ажлууд.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn onClick={() => setShowCarryOver(false)} variant="ghost">Болих</Btn>
            <Btn onClick={handleCarryOver} variant="primary">Татах</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// SECTION 15: REPORT LIST VIEW
// ============================================================
function ReportListView() {
  const { reports, setCurrentReport, setActiveView, deleteReport, showToast, currentUser } = useApp();
  const [filter, setFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");

  const active = reports.filter(r => r.status !== "Archived");
  const filtered = active.filter(r => {
    if (filter !== "all" && r.status !== filter) return false;
    if (searchQ && !r.general.project?.toLowerCase().includes(searchQ.toLowerCase()) && !r.id.includes(searchQ)) return false;
    return true;
  });

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(reports, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `CDR_Backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
    showToast("JSON backup татагдлаа ✓");
  };

  const handleImportJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (Array.isArray(imported)) {
          LS.set("cdr_reports", imported);
          window.location.reload();
        }
      } catch { showToast("JSON файл буруу байна", "danger"); }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>Тайлангийн жагсаалт</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn onClick={handleExportJSON} variant="ghost" size="sm">📥 JSON backup</Btn>
          <label style={{ cursor: "pointer" }}>
            <Btn variant="ghost" size="sm" onClick={() => {}}>📤 JSON import</Btn>
            <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: "none" }} />
          </label>
          <Btn onClick={() => setActiveView("new_report")} variant="primary" size="sm">+ Шинэ тайлан</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={searchQ} onChange={e => setSearchQ(e.target.value)}
          placeholder="Тайлан хайх..."
          style={{ background: THEME.bgInput, border: `1px solid ${THEME.border}`, borderRadius: THEME.radiusSm, color: THEME.textPrimary, padding: "7px 12px", fontFamily: THEME.fontFamily, fontSize: 13, outline: "none", width: 200 }}
        />
        {["all",...Object.keys(REPORT_STATUSES)].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            background: filter === s ? THEME.primary + "22" : THEME.bgInput,
            border: `1px solid ${filter === s ? THEME.primary : THEME.border}`,
            borderRadius: THEME.radiusSm, padding: "6px 12px", cursor: "pointer",
            fontSize: 11, color: filter === s ? THEME.primary : THEME.textMuted, fontFamily: THEME.fontFamily,
          }}>
            {s === "all" ? "Бүгд" : REPORT_STATUSES[s]?.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
          Тайлан байхгүй байна
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: THEME.fontFamily, fontSize: 13 }}>
            <thead>
              <tr style={{ background: THEME.bgInput }}>
                {["Тайлангийн дугаар","Огноо","Төсөл","Бүрэн байдал","Статус","Хянасан","Үйлдэл"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: THEME.textMuted, fontWeight: 600, borderBottom: `1px solid ${THEME.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.reverse().map(r => {
                const st = REPORT_STATUSES[r.status];
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${THEME.border}22`, transition: "background 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = THEME.bgCardHover}
                    onMouseLeave={e => e.currentTarget.style.background = ""}
                  >
                    <td style={{ padding: "10px 12px", color: THEME.textSecondary }}>{r.id}</td>
                    <td style={{ padding: "10px 12px", color: THEME.textPrimary }}>{r.general.date}</td>
                    <td style={{ padding: "10px 12px", color: THEME.textPrimary }}>{r.general.project || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 60 }}><ProgressBar value={r.completenessScore} /></div>
                        <span style={{ fontSize: 12, color: THEME.textSecondary }}>{r.completenessScore}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}><Badge label={st?.label} color={st?.color || THEME.textMuted} /></td>
                    <td style={{ padding: "10px 12px", color: THEME.textMuted, fontSize: 11 }}>{r.updatedAt?.slice(0,16).replace("T"," ")}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Btn onClick={() => { setCurrentReport(r); setActiveView("report_detail"); }} variant="ghost" size="sm">Харах</Btn>
                        {r.status === "Draft" && (
                          <Btn onClick={() => { setCurrentReport(r); setActiveView("new_report"); }} variant="secondary" size="sm">Засах</Btn>
                        )}
                        {["admin"].includes(currentUser?.role) && (
                          <Btn onClick={() => { if(window.confirm("Устгах уу?")) deleteReport(r.id); }} variant="danger" size="sm">Устгах</Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SECTION 16: REPORT DETAIL VIEW
// ============================================================
function ReportDetailView() {
  const { currentReport, setActiveView, showToast, saveReport, addAudit, currentUser } = useApp();
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveAction, setApproveAction] = useState("");
  const [approveComment, setApproveComment] = useState("");
  const [approveName, setApproveName] = useState(currentUser?.name || "");
  const [approvePosition, setApprovePosition] = useState("");

  if (!currentReport) return <div style={{ padding: 24, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>Тайлан сонгогдоогүй байна</div>;

  const r = currentReport;
  const st = REPORT_STATUSES[r.status];
  const ref = generateRefCode(r);
  const totalCost = (r.costs.labor||0)+(r.costs.equipment||0)+(r.costs.material||0)+(r.costs.transport||0)+(r.costs.other||0);
  const avgProgress = r.workProgress.length > 0
    ? Math.round(r.workProgress.reduce((s,w)=>s+(w.completion||0),0)/r.workProgress.length) : 0;

  const canApprove = (currentUser?.role === "manager" && ["Submitted","UnderReview"].includes(r.status))
    || (currentUser?.role === "client" && r.status === "ApprovedByManager")
    || currentUser?.role === "admin";

  const handleApproveAction = () => {
    if (!approveName || !approvePosition) { showToast("Нэр болон албан тушаал оруулна уу", "warning"); return; }
    if (approveAction === "Return" && !approveComment) { showToast("Буцаах шалтгаан бичнэ үү", "warning"); return; }

    const statusMap = {
      Approve: currentUser?.role === "client" ? "ApprovedByClient" : "ApprovedByManager",
      Return: "Returned",
      Archive: "Archived",
    };
    const newStatus = statusMap[approveAction] || r.status;
    const updated = addAudit(r, approveAction === "Approve" ? "Баталсан" : approveAction === "Return" ? "Буцаасан" : "Архивласан", approveComment, r.status, newStatus);
    saveReport(updated);
    setShowApproveModal(false);
    showToast(approveAction === "Approve" ? "Тайлан батлагдлаа ✓" : "Тайлан буцаагдлаа", approveAction === "Approve" ? "success" : "warning");
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <div>
          <Btn onClick={() => setActiveView("reports")} variant="ghost" size="sm" style={{ marginBottom: 8 }}>← Буцах</Btn>
          <h2 style={{ margin: 0, color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>{r.id}</h2>
          <div style={{ fontSize: 12, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>{r.general.project} · {r.general.date}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge label={st?.label} color={st?.color || THEME.textMuted} />
          <Btn onClick={() => exportToExcel(r)} variant="success" size="sm">📊 Excel</Btn>
          <Btn onClick={() => window.print()} variant="ghost" size="sm">🖨️ Хэвлэх</Btn>
          {canApprove && r.status !== "Archived" && (
            <>
              <Btn onClick={() => { setApproveAction("Approve"); setShowApproveModal(true); }} variant="success" size="sm">✅ Батлах</Btn>
              <Btn onClick={() => { setApproveAction("Return"); setShowApproveModal(true); }} variant="warning" size="sm">↩ Буцаах</Btn>
            </>
          )}
          {currentUser?.role === "admin" && (
            <Btn onClick={() => { setApproveAction("Archive"); setShowApproveModal(true); }} variant="secondary" size="sm">🗄️ Архивлах</Btn>
          )}
        </div>
      </div>

      {/* Completeness */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontFamily: THEME.fontFamily, fontSize: 14, color: THEME.textSecondary }}>Тайлангийн бүрэн байдал</span>
          <span style={{ fontFamily: THEME.fontFamily, fontSize: 18, fontWeight: 800, color: r.completenessScore >= 80 ? THEME.success : THEME.warning }}>{r.completenessScore}%</span>
        </div>
        <ProgressBar value={r.completenessScore} />
      </Card>

      {/* Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Бодит хүн цаг" value={r.manhours.actualHours} icon="⏱️" color={THEME.primary} />
        <StatCard label="Ажлын биелэлт" value={`${avgProgress}%`} icon="📈" color={avgProgress >= 90 ? THEME.success : avgProgress >= 70 ? THEME.warning : THEME.danger} />
        <StatCard label="HSE цаг" value={r.hse.manhoursToday} icon="🦺" color={THEME.success} />
        <StatCard label="LTI" value={r.hse.lti} icon="🚨" color={r.hse.lti > 0 ? THEME.danger : THEME.success} />
        <StatCard label="Нийт зардал" value={`₮${(totalCost/1000000).toFixed(1)}М`} icon="💰" color={THEME.accent} />
        <StatCard label="Action" value={r.actionTracker.length} icon="📌" color={THEME.primary} />
      </div>

      {/* Work progress */}
      {r.workProgress.length > 0 && (
        <Card title="Ажлын биелэлт">
          {r.workProgress.map((w, i) => (
            <div key={w.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < r.workProgress.length-1 ? `1px solid ${THEME.border}22` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontFamily: THEME.fontFamily, fontSize: 14, color: THEME.textPrimary }}>{w.name}</span>
                <span style={{ fontFamily: THEME.fontFamily, fontSize: 13, fontWeight: 700, color: w.completion >= 90 ? THEME.success : w.completion >= 70 ? THEME.warning : THEME.danger }}>{w.completion}%</span>
              </div>
              <ProgressBar value={w.completion} />
              {w.notes && <div style={{ fontSize: 11, color: THEME.textMuted, fontFamily: THEME.fontFamily, marginTop: 4 }}>{w.notes}</div>}
            </div>
          ))}
        </Card>
      )}

      {/* HSE summary */}
      <Card title="HSE Хураангуй">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, fontFamily: THEME.fontFamily, fontSize: 13 }}>
          {[
            ["Toolbox Talk", r.hse.toolboxTalk ? "Тийм ✓" : "Үгүй"],
            ["LTI", r.hse.lti],
            ["Near Miss", r.hse.nearMiss],
            ["PPE Compliance", `${r.hse.ppeCompliance}%`],
            ["Stop Work", r.hse.stopWork ? "Тийм" : "Үгүй"],
            ["Inspection", r.hse.hseInspection],
          ].map(([k,v]) => (
            <div key={k} style={{ background: THEME.bgInput, padding: "8px 10px", borderRadius: THEME.radiusSm }}>
              <div style={{ fontSize: 10, color: THEME.textMuted }}>{k}</div>
              <div style={{ fontWeight: 700, color: THEME.textPrimary }}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Action tracker */}
      {r.actionTracker.length > 0 && (
        <Card title="Action Tracker">
          {r.actionTracker.map(a => {
            const od = isOverdue(a);
            return (
              <div key={a.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 10px", borderRadius: THEME.radiusSm, marginBottom: 6,
                background: od ? THEME.danger + "10" : THEME.bgInput,
                border: `1px solid ${od ? THEME.danger + "44" : THEME.border}`,
              }}>
                <div>
                  <div style={{ fontSize: 13, color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>{a.description}</div>
                  <div style={{ fontSize: 11, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>{a.responsible} · {a.dueDate}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Badge label={a.priority} color={a.priority === "Өндөр" ? THEME.danger : a.priority === "Дунд" ? THEME.warning : THEME.success} />
                  <Badge label={od ? "Хугацаа хэтэрсэн" : a.status} color={od ? THEME.danger : a.status === "Closed" ? THEME.success : THEME.primary} />
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Photos */}
      {r.photos.length > 0 && (
        <Card title={`Фото нотолгоо (${r.photos.length})`}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {r.photos.map(p => (
              <div key={p.id} style={{ borderRadius: THEME.radiusSm, overflow: "hidden", border: `1px solid ${THEME.border}` }}>
                <img src={p.data} alt={p.description || ""} style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
                {p.description && <div style={{ fontSize: 11, color: THEME.textSecondary, fontFamily: THEME.fontFamily, padding: "4px 8px" }}>{p.description}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Signatures */}
      <Card title="Гарын үсэг / Баталгаажуулалт">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {[
            { key: "prepared", label: "Бэлтгэсэн" },
            { key: "reviewed", label: "Хянасан" },
            { key: "approved", label: "Баталсан" },
            { key: "clientApproved", label: "Захиалагч баталсан" },
          ].map(s => {
            const sig = r.signatures[s.key];
            return (
              <div key={s.key} style={{ background: THEME.bgInput, padding: "12px", borderRadius: THEME.radiusSm, border: `1px solid ${THEME.border}` }}>
                <div style={{ fontSize: 11, color: THEME.textMuted, fontFamily: THEME.fontFamily, marginBottom: 6, fontWeight: 700 }}>{s.label}</div>
                {sig ? (
                  <>
                    <div style={{ fontSize: 13, color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>{sig.name}</div>
                    <div style={{ fontSize: 11, color: THEME.textSecondary, fontFamily: THEME.fontFamily }}>{sig.position}</div>
                    <div style={{ fontSize: 10, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>{sig.date}</div>
                    {sig.canvasData && <img src={sig.canvasData} alt="sig" style={{ width: "100%", height: 50, objectFit: "contain", marginTop: 6 }} />}
                  </>
                ) : <div style={{ fontSize: 12, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>Гарын үсэг байхгүй</div>}
              </div>
            );
          })}
        </div>
      </Card>

      {/* QR Reference */}
      <Card title="Local Reference Code">
        <div style={{ fontSize: 11, color: THEME.warning, fontFamily: THEME.fontFamily, marginBottom: 8 }}>
          ⚠️ Backend байхгүй тул энэхүү reference нь зөвхөн prototype/local зориулалттай.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            {Array.from({ length: 64 }, (_, i) => {
              const h = parseInt(ref.display.charCodeAt(i % ref.display.length).toString(16), 16);
              return <rect key={i} x={(i%8)*10} y={Math.floor(i/8)*10} width={9} height={9} rx={1} fill={(h + i) % 3 === 0 ? THEME.primary : THEME.bgInput} opacity={0.8} />;
            })}
          </svg>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: THEME.primary, fontFamily: "monospace" }}>{ref.display}</div>
            <div style={{ fontSize: 10, color: THEME.textMuted, fontFamily: "monospace", wordBreak: "break-all" }}>{ref.raw}</div>
          </div>
        </div>
      </Card>

      {/* Audit trail */}
      {r.auditTrail.length > 0 && (
        <Card title="Audit Trail">
          {r.auditTrail.map(a => (
            <div key={a.id} style={{ display: "flex", gap: 12, paddingBottom: 10, borderBottom: `1px solid ${THEME.border}22`, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: THEME.primary, marginTop: 4, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, color: THEME.textPrimary, fontFamily: THEME.fontFamily }}><strong>{a.actor}</strong> ({ROLES.find(r=>r.id===a.role)?.label}) — {a.action}</div>
                <div style={{ fontSize: 11, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>{a.timestamp?.slice(0,16).replace("T"," ")} · {a.fromStatus} → {a.toStatus}</div>
                {a.comment && <div style={{ fontSize: 12, color: THEME.textSecondary, fontFamily: THEME.fontFamily }}>{a.comment}</div>}
              </div>
            </div>
          ))}
        </Card>
      )}

      {showApproveModal && (
        <Modal title={approveAction === "Approve" ? "Тайлан батлах" : approveAction === "Return" ? "Тайлан буцаах" : "Архивлах"} onClose={() => setShowApproveModal(false)}>
          <Input label="Нэр" value={approveName} onChange={setApproveName} required />
          <Input label="Албан тушаал" value={approvePosition} onChange={setApprovePosition} required />
          <Textarea label={approveAction === "Return" ? "Буцаах шалтгаан (заавал)" : "Тайлбар (сонголттой)"} value={approveComment} onChange={setApproveComment} rows={3} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <Btn onClick={() => setShowApproveModal(false)} variant="ghost">Болих</Btn>
            <Btn onClick={handleApproveAction} variant={approveAction === "Approve" ? "success" : approveAction === "Return" ? "warning" : "secondary"}>
              {approveAction === "Approve" ? "✅ Батлах" : approveAction === "Return" ? "↩ Буцаах" : "🗄️ Архивлах"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// SECTION 17: APPROVAL VIEW
// ============================================================
function ApprovalView() {
  const { reports, setCurrentReport, setActiveView, currentUser } = useApp();

  const pendingReports = reports.filter(r => {
    if (currentUser?.role === "manager") return ["Submitted","UnderReview"].includes(r.status);
    if (currentUser?.role === "client") return r.status === "ApprovedByManager";
    if (currentUser?.role === "admin") return r.status !== "Draft" && r.status !== "Archived";
    return false;
  });

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 20px", color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>Батлах / Хянах</h2>
      {pendingReports.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <div style={{ marginTop: 8 }}>Хянах тайлан байхгүй байна</div>
        </div>
      ) : (
        pendingReports.map(r => {
          const st = REPORT_STATUSES[r.status];
          const avgP = r.workProgress.length > 0
            ? Math.round(r.workProgress.reduce((s,w)=>s+(w.completion||0),0)/r.workProgress.length) : 0;
          return (
            <Card key={r.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontFamily: THEME.fontFamily, fontSize: 15, fontWeight: 700, color: THEME.textPrimary }}>{r.id}</div>
                  <div style={{ fontSize: 13, color: THEME.textSecondary, fontFamily: THEME.fontFamily }}>{r.general.project} · {r.general.date}</div>
                  <div style={{ fontSize: 12, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>Бэлтгэсэн: {r.general.preparedBy}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge label={st?.label} color={st?.color || THEME.textMuted} />
                  <div style={{ fontSize: 13, fontFamily: THEME.fontFamily, color: avgP >= 70 ? THEME.success : THEME.warning }}>Биелэлт: {avgP}%</div>
                  <div style={{ fontSize: 13, fontFamily: THEME.fontFamily, color: r.completenessScore >= 80 ? THEME.success : THEME.warning }}>Бүрэн байдал: {r.completenessScore}%</div>
                  <Btn onClick={() => { setCurrentReport(r); setActiveView("report_detail"); }} variant="primary" size="sm">Дэлгэрэнгүй →</Btn>
                </div>
              </div>
              {r.hse.lti > 0 && <div style={{ fontSize: 12, color: THEME.danger, fontFamily: THEME.fontFamily, marginTop: 8 }}>🚨 LTI: {r.hse.lti}</div>}
            </Card>
          );
        })
      )}
    </div>
  );
}

// ============================================================
// SECTION 18: ARCHIVE VIEW
// ============================================================
function ArchiveView() {
  const { reports, setCurrentReport, setActiveView } = useApp();
  const archived = reports.filter(r => r.status === "Archived" || r.status === "ApprovedByClient");

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 20px", color: THEME.textPrimary, fontFamily: THEME.fontFamily }}>Архив</h2>
      {archived.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: THEME.textMuted, fontFamily: THEME.fontFamily }}>
          <div style={{ fontSize: 40 }}>🗄️</div>
          <div style={{ marginTop: 8 }}>Архивласан тайлан байхгүй байна</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: THEME.fontFamily, fontSize: 13 }}>
            <thead>
              <tr style={{ background: THEME.bgInput }}>
                {["Тайлангийн дугаар","Огноо","Төсөл","Статус","Үйлдэл"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: THEME.textMuted, fontWeight: 600, borderBottom: `1px solid ${THEME.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {archived.map(r => {
                const st = REPORT_STATUSES[r.status];
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${THEME.border}22` }}>
                    <td style={{ padding: "10px 12px", color: THEME.textSecondary }}>{r.id}</td>
                    <td style={{ padding: "10px 12px", color: THEME.textPrimary }}>{r.general.date}</td>
                    <td style={{ padding: "10px 12px", color: THEME.textPrimary }}>{r.general.project}</td>
                    <td style={{ padding: "10px 12px" }}><Badge label={st?.label} color={st?.color || THEME.textMuted} /></td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Btn onClick={() => { setCurrentReport(r); setActiveView("report_detail"); }} variant="ghost" size="sm">Харах</Btn>
                        <Btn onClick={() => exportToExcel(r)} variant="success" size="sm">Excel</Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SECTION 19: PRINT STYLES
// ============================================================
const printStyles = `
@media print {
  .no-print { display: none !important; }
  body { background: white !important; color: black !important; }
  .print-report { background: white !important; color: black !important; }
  @page { size: A4; margin: 15mm; }
}
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
`;

// ============================================================
// SECTION 20: MAIN APP
// ============================================================
function MainApp() {
  const { currentUser, activeView, setActiveView, currentReport } = useApp();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const renderView = () => {
    switch(activeView) {
      case "dashboard": return <DashboardView />;
      case "new_report": return <NewReportView />;
      case "reports": return <ReportListView />;
      case "archive": return <ArchiveView />;
      case "approval": return <ApprovalView />;
      case "report_detail": return <ReportDetailView />;
      default: return <DashboardView />;
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: THEME.bg, fontFamily: THEME.fontFamily }}>
      {!isMobile && <div className="no-print"><Sidebar isMobile={false} /></div>}
      <div style={{ flex: 1, overflow: "auto", paddingBottom: isMobile ? 70 : 0 }}>
        {renderView()}
      </div>
      {isMobile && <div className="no-print"><Sidebar isMobile={true} /></div>}
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <>
      <style>{printStyles}</style>
      <AppProvider>
        <AppConsumer />
      </AppProvider>
    </>
  );
}

function AppConsumer() {
  const { currentUser } = useApp();
  if (!currentUser) return <LoginView />;
  return <MainApp />;
}
