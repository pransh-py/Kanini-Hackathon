import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./DoctorDashboard.css";
import "./NurseDashboard.css";
import "./EmergencyCases.css";

const API = "http://localhost:8000";

function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.startsWith(name + "=")) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

// ── Symptom metadata ──
const SYMPTOM_FIELDS = [
  "chest_pain",
  "severe_breathlessness",
  "sudden_confusion",
  "stroke_symptoms",
  "seizure",
  "severe_trauma",
  "uncontrolled_bleeding",
  "loss_of_consciousness",
  "severe_allergic_reaction",
  "persistent_fever",
  "vomiting",
  "moderate_abdominal_pain",
  "persistent_cough",
  "moderate_breathlessness",
  "severe_headache",
  "dizziness",
  "dehydration",
  "palpitations",
  "migraine",
  "mild_headache",
  "sore_throat",
  "runny_nose",
  "mild_cough",
  "fatigue",
  "body_ache",
  "mild_abdominal_pain",
  "skin_rash",
  "mild_back_pain",
  "mild_joint_pain",
];

const CRITICAL_SYMPTOMS = [
  "chest_pain",
  "severe_breathlessness",
  "sudden_confusion",
  "stroke_symptoms",
  "seizure",
  "severe_trauma",
  "uncontrolled_bleeding",
  "loss_of_consciousness",
  "severe_allergic_reaction",
];
const MODERATE_SYMPTOMS = [
  "persistent_fever",
  "vomiting",
  "moderate_abdominal_pain",
  "persistent_cough",
  "moderate_breathlessness",
  "severe_headache",
  "dizziness",
  "dehydration",
  "palpitations",
  "migraine",
];

function symptomSeverity(s) {
  if (CRITICAL_SYMPTOMS.includes(s)) return "critical";
  if (MODERATE_SYMPTOMS.includes(s)) return "moderate";
  return "mild";
}

function symptomLabel(s) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Body region mapping ──
const BODY_REGIONS = [
  {
    id: "head",
    name: "Head",
    cx: 150,
    cy: 55,
    symptoms: [
      "sudden_confusion",
      "stroke_symptoms",
      "severe_headache",
      "migraine",
      "mild_headache",
      "dizziness",
    ],
  },
  { id: "throat", name: "Throat", cx: 150, cy: 85, symptoms: ["sore_throat"] },
  {
    id: "chest",
    name: "Chest",
    cx: 150,
    cy: 135,
    symptoms: [
      "chest_pain",
      "palpitations",
      "persistent_cough",
      "moderate_breathlessness",
      "severe_breathlessness",
    ],
  },
  {
    id: "abdomen",
    name: "Abdomen",
    cx: 150,
    cy: 185,
    symptoms: ["moderate_abdominal_pain", "mild_abdominal_pain", "vomiting"],
  },
  {
    id: "l_arm",
    name: "Left Arm",
    cx: 95,
    cy: 150,
    symptoms: ["severe_trauma", "uncontrolled_bleeding"],
  },
  {
    id: "r_arm",
    name: "Right Arm",
    cx: 205,
    cy: 150,
    symptoms: ["severe_trauma", "uncontrolled_bleeding"],
  },
  {
    id: "l_leg",
    name: "Left Leg",
    cx: 130,
    cy: 300,
    symptoms: ["mild_joint_pain"],
  },
  {
    id: "r_leg",
    name: "Right Leg",
    cx: 170,
    cy: 300,
    symptoms: ["mild_joint_pain"],
  },
];

const HISTORY_BOOLEANS = [
  "diabetes",
  "hypertension",
  "heart_disease",
  "asthma",
  "chronic_kidney_disease",
  "previous_stroke",
  "smoker",
  "obese",
  "previous_heart_attack",
  "previous_hospitalization",
];

function getActiveSymptoms(item) {
  return SYMPTOM_FIELDS.filter((s) => item[s]);
}

function getRegionSeverity(activeSymptoms, regionSymptoms) {
  const matched = regionSymptoms.filter((s) => activeSymptoms.includes(s));
  if (matched.length === 0) return null;
  if (matched.some((s) => CRITICAL_SYMPTOMS.includes(s))) return "critical";
  if (matched.some((s) => MODERATE_SYMPTOMS.includes(s))) return "moderate";
  return "mild";
}

function severityColor(sev) {
  if (sev === "critical") return "#ef4444";
  if (sev === "moderate") return "#f59e0b";
  return "#4ade80";
}

function riskClass(risk) {
  if (!risk) return "risk-unknown";
  const r = risk.toLowerCase();
  if (r.includes("high") || r.includes("critical")) return "risk-high";
  if (r.includes("moderate") || r.includes("medium")) return "risk-moderate";
  if (r.includes("low")) return "risk-low";
  return "risk-unknown";
}

// ────────────────────────────
// HumanBody SVG Component (Read-Only)
// ────────────────────────────
function HumanBodySVG({ item }) {
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const activeSymptoms = getActiveSymptoms(item);

  const getRegionActiveSymptoms = (region) =>
    region.symptoms.filter((s) => activeSymptoms.includes(s));

  const handleMouseMove = (e) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  return (
    <div
      className="body-svg-container"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredRegion(null)}
      style={{ position: "relative", cursor: "default" }}
    >
      <svg
        viewBox="0 0 1000 1800"
        width="100%"
        height="auto"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="bodyShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="15"
              stdDeviation="10"
              floodColor="#000"
              floodOpacity="0.2"
            />
          </filter>
          <linearGradient id="skinGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f3f4f6" />
            <stop offset="100%" stopColor="#e5e7eb" />
          </linearGradient>
        </defs>

        <g
          filter="url(#bodyShadow)"
          stroke="#94a3b8"
          strokeWidth="4"
          fill="url(#skinGradient)"
        >
          {/* Body Parts - Visual Only */}
          <path
            d="M320 250 C 250 280, 200 400, 220 550 C 230 600, 260 600, 280 550 C 300 450, 320 350, 380 300 Z"
            className={`body-part ${getRegionSeverity(activeSymptoms, BODY_REGIONS.find((r) => r.id === "l_arm").symptoms) ? "active-part" : ""}`}
            onMouseEnter={() =>
              setHoveredRegion(BODY_REGIONS.find((r) => r.id === "l_arm"))
            }
          />
          <path
            d="M680 250 C 750 280, 800 400, 780 550 C 770 600, 740 600, 720 550 C 700 450, 680 350, 620 300 Z"
            className={`body-part ${getRegionSeverity(activeSymptoms, BODY_REGIONS.find((r) => r.id === "r_arm").symptoms) ? "active-part" : ""}`}
            onMouseEnter={() =>
              setHoveredRegion(BODY_REGIONS.find((r) => r.id === "r_arm"))
            }
          />
          <path
            d="M380 800 L 380 1400 C 380 1450, 420 1450, 420 1400 L 420 900 L 480 900 L 480 1600"
            fill="none"
            stroke="none"
          />
          <path
            d="M400 850 C 380 1100, 380 1300, 360 1600 C 400 1620, 440 1620, 460 1600 C 460 1300, 480 1100, 480 900 Z"
            className={`body-part ${getRegionSeverity(activeSymptoms, BODY_REGIONS.find((r) => r.id === "l_leg").symptoms) ? "active-part" : ""}`}
            onMouseEnter={() =>
              setHoveredRegion(BODY_REGIONS.find((r) => r.id === "l_leg"))
            }
          />
          <path
            d="M600 850 C 620 1100, 620 1300, 640 1600 C 600 1620, 560 1620, 540 1600 C 540 1300, 520 1100, 520 900 Z"
            className={`body-part ${getRegionSeverity(activeSymptoms, BODY_REGIONS.find((r) => r.id === "r_leg").symptoms) ? "active-part" : ""}`}
            onMouseEnter={() =>
              setHoveredRegion(BODY_REGIONS.find((r) => r.id === "r_leg"))
            }
          />
          <path
            d="M350 200 C 300 220, 300 700, 350 850 C 500 900, 650 850, 650 850 C 700 700, 700 220, 650 200 Z"
            className={`body-part ${getRegionSeverity(activeSymptoms, BODY_REGIONS.find((r) => r.id === "abdomen").symptoms) ? "active-part" : ""}`}
            onMouseEnter={() =>
              setHoveredRegion(BODY_REGIONS.find((r) => r.id === "abdomen"))
            }
          />
          <circle
            cx="500"
            cy="150"
            r="90"
            className={`body-part ${getRegionSeverity(activeSymptoms, BODY_REGIONS.find((r) => r.id === "head").symptoms) ? "active-part" : ""}`}
            onMouseEnter={() =>
              setHoveredRegion(BODY_REGIONS.find((r) => r.id === "head"))
            }
          />
        </g>

        {/* Markers - Purely visual now */}
        {BODY_REGIONS.map((region) => {
          const matched = getRegionActiveSymptoms(region);
          if (matched.length === 0) return null;

          const severity =
            getRegionSeverity(activeSymptoms, region.symptoms) || "none";
          const x = region.cx * 3.3;
          const y = region.cy * 3.3;

          return (
            <g key={region.name} style={{ pointerEvents: "none" }}>
              <circle
                cx={x}
                cy={y}
                r="50"
                fill={severityColor(severity)}
                opacity="0.3"
                className="pulse"
              />
              <circle
                cx={x}
                cy={y}
                r="20"
                fill={severityColor(severity)}
                stroke="#fff"
                strokeWidth="3"
              />
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip following mouse */}
      {hoveredRegion && getRegionActiveSymptoms(hoveredRegion).length > 0 && (
        <div
          className="hover-symptom-panel"
          style={{
            position: "absolute",
            top: tooltipPos.y + 15 + "px",
            left: tooltipPos.x + 15 + "px",
            pointerEvents: "none",
            zIndex: 100,
            background: "rgba(255, 255, 255, 0.95)",
            padding: "8px 12px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            backdropFilter: "blur(4px)",
            border: "1px solid #e2e8f0",
            minWidth: "max-content",
          }}
        >
          <h4
            style={{
              margin: "0 0 6px 0",
              fontSize: "12px",
              color: "#64748b",
              textTransform: "uppercase",
            }}
          >
            {hoveredRegion.name}
          </h4>
          <div
            className="symptom-tags"
            style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}
          >
            {getRegionActiveSymptoms(hoveredRegion).map((s) => (
              <span key={s} className={`symptom-tag ${symptomSeverity(s)}`}>
                {symptomLabel(s)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────
// Main Component
// ────────────────────────────
function DoctorDashboard() {
  const [triageList, setTriageList] = useState([]);
  const [emergencyList, setEmergencyList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState(null);

  // Modal States (REMOVED: showEditClinical)
  const [showResolve, setShowResolve] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);

  // Form States (REMOVED: clinicalForm)
  const [convertForm, setConvertForm] = useState({
    systolic_bp: "",
    heart_rate: "",
    temperature: "",
    oxygen: "",
  });
  const [convertSymptoms, setConvertSymptoms] = useState({});
  const [historyForm, setHistoryForm] = useState({});

  const [actionLoading, setActionLoading] = useState(false);
  const navigate = useNavigate();

  // Auth check
  useEffect(() => {
    fetch(`${API}/api/user-role/`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) navigate("/");
        return res.json();
      })
      .then((d) => {
        if (d.role !== "doctor") navigate("/");
        else setUserName(d.name);
      })
      .catch(() => navigate("/"));
  }, [navigate]);

  // Load data
  const loadData = useCallback(() => {
    fetch(`${API}/api/doctor-dashboard/`, { credentials: "include" })
      .then((res) => res.json())
      .then((result) => {
        if (result.triage_requests) setTriageList(result.triage_requests);
        if (result.emergency_requests)
          setEmergencyList(result.emergency_requests);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = async () => {
    await fetch(`${API}/api/logout/`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRFToken": getCookie("csrftoken") },
    });
    navigate("/");
  };

  const selectItem = (type, data) => {
    setSelected({ type, data });
    setShowResolve(false);
    setShowConvert(false);
    setShowEditHistory(false);
  };

  const goBack = () => {
    setSelected(null);
    setShowResolve(false);
    setShowConvert(false);
    setShowEditHistory(false);
  };

  // ──────────────── Resolve ────────────────
  const handleResolve = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(
        `${API}/api/triage-request/${selected.data.id}/resolve/`,
        {
          method: "DELETE",
          credentials: "include",
          headers: { "X-CSRFToken": getCookie("csrftoken") },
        },
      );
      if (res.ok) {
        setTriageList((prev) => prev.filter((t) => t.id !== selected.data.id));
        goBack();
      }
    } finally {
      setActionLoading(false);
    }
  };

  // ──────────────── Convert ────────────────
  const openConvert = () => {
    setShowConvert(true);
    setConvertForm({
      systolic_bp: "",
      heart_rate: "",
      temperature: "",
      oxygen: "",
    });
    setConvertSymptoms({});
  };

  const handleConvert = async () => {
    setActionLoading(true);
    try {
      const body = {
        ...convertForm,
        ...convertSymptoms,
      };
      const res = await fetch(
        `${API}/api/emergency/${selected.data.id}/convert/`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie("csrftoken"),
          },
          body: JSON.stringify(body),
        },
      );
      if (res.ok) {
        const newTriage = await res.json();
        setEmergencyList((prev) =>
          prev.filter((e) => e.id !== selected.data.id),
        );
        setTriageList((prev) => [newTriage, ...prev]);
        goBack();
      }
    } finally {
      setActionLoading(false);
    }
  };

  // ──────────────── Edit History ────────────────
  const openEditHistory = () => {
    const d = selected.data;
    const form = {};
    HISTORY_BOOLEANS.forEach((f) => {
      form[f] = d[`patient_${f}`] || false;
    });
    form.allergies = d.patient_allergies || "";
    form.past_surgeries = d.patient_past_surgeries || "";
    setHistoryForm(form);
    setShowEditHistory(true);
  };

  const handleSaveHistory = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(
        `${API}/api/patient/${selected.data.patient_id}/history/`, // Check this URL matches the one in urls.py
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie("csrftoken"),
          },
          body: JSON.stringify(historyForm),
        },
      );
      if (res.ok) {
        const updatePatientFields = (item) => {
          const updated = { ...item };
          HISTORY_BOOLEANS.forEach((f) => {
            updated[`patient_${f}`] = historyForm[f];
          });
          updated.patient_allergies = historyForm.allergies;
          updated.patient_past_surgeries = historyForm.past_surgeries;
          return updated;
        };
        const updateState = (list) =>
          list.map((item) =>
            item.id === selected.data.id ? updatePatientFields(item) : item,
          );

        if (selected.type === "triage")
          setTriageList((prev) => updateState(prev));
        else setEmergencyList((prev) => updateState(prev));

        setSelected((prev) => ({
          ...prev,
          data: updatePatientFields(prev.data),
        }));
        setShowEditHistory(false);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const filteredItems = () => {
    const items = [];
    if (tab === "all" || tab === "triage") {
      triageList.forEach((t) => items.push({ type: "triage", data: t }));
    }
    if (tab === "all" || tab === "emergency") {
      emergencyList.forEach((e) => items.push({ type: "emergency", data: e }));
    }
    return items;
  };

  if (loading)
    return <div className="doctor-loading">Loading dashboard...</div>;

  if (selected) {
    const item = selected.data;
    const isTriage = selected.type === "triage";

    // ── GET ALL ACTIVE SYMPTOMS (For the comprehensive list) ──
    const activeSymptoms = getActiveSymptoms(item);

    return (
      <div className="doctor-page">
        <header className="doctor-header">
          <div className="doctor-header-left">
            <svg viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            <span>ApexHealth</span>
          </div>
          <div className="doctor-header-right">
            <span className="doctor-name">
              Dr. <strong>{userName}</strong>
            </span>
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <main className="doctor-main detail-view">
          <button className="back-btn" onClick={goBack}>
            Back to List
          </button>

          <div className="detail-layout">
            {isTriage && (
              <div className="detail-left">
                <HumanBodySVG item={item} />
              </div>
            )}

            <div className="detail-right">
              <div className="patient-info-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <h3>{item.patient_name}</h3>
                    <div className="patient-info-meta">
                      {item.patient_age}y, {item.patient_gender}
                      {item.patient_blood_group &&
                        ` | ${item.patient_blood_group}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {isTriage ? (
                      <span
                        className={`risk-badge ${riskClass(item.predicted_risk)}`}
                      >
                        {item.predicted_risk || "N/A"}
                      </span>
                    ) : (
                      <span className="emergency-badge">Emergency</span>
                    )}
                  </div>
                </div>

                {/* Vitals Grid (Display) */}
                <div className="vitals-grid">
                  <div className="vital-item">
                    <div className="vital-label">BP</div>
                    <div className="vital-value">
                      {item.systolic_bp || "--"}
                    </div>
                  </div>
                  <div className="vital-item">
                    <div className="vital-label">HR</div>
                    <div className="vital-value">{item.heart_rate || "--"}</div>
                  </div>
                  <div className="vital-item">
                    <div className="vital-label">Temp</div>
                    <div className="vital-value">
                      {item.temperature || "--"}
                    </div>
                  </div>
                  <div className="vital-item">
                    <div className="vital-label">SpO2</div>
                    <div className="vital-value">
                      {item.oxygen ? item.oxygen + "%" : "--"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="detail-actions">
                {isTriage && (
                  <button
                    className="action-resolve"
                    onClick={() => setShowResolve(true)}
                  >
                    Resolve / Discharge
                  </button>
                )}
                {!isTriage && (
                  <button className="action-convert" onClick={openConvert}>
                    Convert to Inpatient
                  </button>
                )}
                {/* REMOVED: "Update Clinical Data" Button */}
                <button
                  className="action-edit-history"
                  onClick={openEditHistory}
                >
                  Edit History
                </button>
              </div>

              {/* ──────────────────────────────────────────────
                  UPDATED: Full Active Symptoms List
                  (Shows ALL active symptoms, not just systemic)
                 ────────────────────────────────────────────── */}
              {activeSymptoms.length > 0 && (
                <div
                  style={{
                    marginTop: "24px",
                    paddingTop: "16px",
                    borderTop: "1px dashed #e2e8f0",
                  }}
                >
                  <h4
                    style={{
                      fontSize: "13px",
                      color: "#64748b",
                      textTransform: "uppercase",
                      marginBottom: "12px",
                    }}
                  >
                    Active Clinical Symptoms
                  </h4>
                  <div className="symptom-tags">
                    {activeSymptoms.map((s) => (
                      <span
                        key={s}
                        className={`symptom-tag ${symptomSeverity(s)}`}
                      >
                        {symptomLabel(s)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Modals */}
              {showResolve && (
                <div className="resolve-confirm">
                  <p>
                    Resolve triage for <strong>{item.patient_name}</strong>?
                  </p>
                  <div className="resolve-confirm-actions">
                    <button
                      className="resolve-yes"
                      onClick={handleResolve}
                      disabled={actionLoading}
                    >
                      Yes
                    </button>
                    <button
                      className="resolve-no"
                      onClick={() => setShowResolve(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {showConvert && (
                <div className="convert-form">
                  <h4>Convert to Inpatient</h4>
                  <div className="vitals-form">
                    <div className="form-field">
                      <label>BP</label>
                      <input
                        type="number"
                        value={convertForm.systolic_bp}
                        onChange={(e) =>
                          setConvertForm({
                            ...convertForm,
                            systolic_bp: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>HR</label>
                      <input
                        type="number"
                        value={convertForm.heart_rate}
                        onChange={(e) =>
                          setConvertForm({
                            ...convertForm,
                            heart_rate: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>Temp</label>
                      <input
                        type="number"
                        value={convertForm.temperature}
                        onChange={(e) =>
                          setConvertForm({
                            ...convertForm,
                            temperature: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>SpO2</label>
                      <input
                        type="number"
                        value={convertForm.oxygen}
                        onChange={(e) =>
                          setConvertForm({
                            ...convertForm,
                            oxygen: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <button className="convert-submit" onClick={handleConvert}>
                    Convert
                  </button>
                </div>
              )}

              {showEditHistory && (
                <div className="edit-history-form">
                  <h4>Edit History</h4>
                  <div className="checkbox-grid">
                    {HISTORY_BOOLEANS.map((f) => (
                      <label className="checkbox-label" key={f}>
                        <input
                          type="checkbox"
                          checked={!!historyForm[f]}
                          onChange={(e) =>
                            setHistoryForm((prev) => ({
                              ...prev,
                              [f]: e.target.checked,
                            }))
                          }
                        />
                        {symptomLabel(f)}
                      </label>
                    ))}
                  </div>
                  <div className="edit-history-text">
                    <label>Allergies</label>
                    <textarea
                      rows={2}
                      value={historyForm.allergies}
                      onChange={(e) =>
                        setHistoryForm({
                          ...historyForm,
                          allergies: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="edit-history-text">
                    <label>Past Surgeries</label>
                    <textarea
                      rows={2}
                      value={historyForm.past_surgeries}
                      onChange={(e) =>
                        setHistoryForm({
                          ...historyForm,
                          past_surgeries: e.target.value,
                        })
                      }
                    />
                  </div>
                  <button
                    className="history-save-btn"
                    onClick={handleSaveHistory}
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // LIST VIEW
  const items = filteredItems();

  return (
    <div className="doctor-page">
      <header className="doctor-header">
        <div className="doctor-header-left">
          <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
          <span>ApexHealth</span>
        </div>
        <div className="doctor-header-right">
          <span className="doctor-name">
            Dr. <strong>{userName}</strong>
          </span>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="doctor-main">
        <div className="tab-filter">
          <button
            className={`tab-btn ${tab === "all" ? "active" : ""}`}
            onClick={() => setTab("all")}
          >
            All{" "}
            <span className="tab-count">
              {triageList.length + emergencyList.length}
            </span>
          </button>
          <button
            className={`tab-btn ${tab === "triage" ? "active" : ""}`}
            onClick={() => setTab("triage")}
          >
            Triage <span className="tab-count">{triageList.length}</span>
          </button>
          <button
            className={`tab-btn ${tab === "emergency" ? "active" : ""}`}
            onClick={() => setTab("emergency")}
          >
            Emergency <span className="tab-count">{emergencyList.length}</span>
          </button>
        </div>

        <div className="triage-grid">
          {items.map(({ type, data }) => (
            <div
              key={`${type}-${data.id}`}
              className="triage-card clickable"
              onClick={() => selectItem(type, data)}
            >
              <div className="triage-card-header">
                <div>
                  <div className="patient-name">{data.patient_name}</div>
                  <div className="patient-meta">
                    {data.patient_age}y, {data.patient_gender}
                  </div>
                </div>
                <span
                  className={`risk-badge ${riskClass(data.predicted_risk)}`}
                >
                  {data.predicted_risk || "N/A"}
                </span>
              </div>
              <div className="triage-card-footer">
                <span className="department">
                  {data.recommended_department || data.department}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default DoctorDashboard;
