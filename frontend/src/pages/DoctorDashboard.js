import { useEffect, useState, useCallback } from "react";
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
// everything else is mild

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
    name: "Head",
    cx: 150,
    cy: 45,
    symptoms: [
      "sudden_confusion",
      "stroke_symptoms",
      "loss_of_consciousness",
      "severe_headache",
      "dizziness",
      "migraine",
      "mild_headache",
    ],
  },
  { name: "Throat", cx: 150, cy: 85, symptoms: ["sore_throat"] },
  {
    name: "Chest",
    cx: 150,
    cy: 130,
    symptoms: [
      "chest_pain",
      "severe_breathlessness",
      "palpitations",
      "moderate_breathlessness",
      "persistent_cough",
    ],
  },
  {
    name: "Abdomen",
    cx: 150,
    cy: 185,
    symptoms: ["moderate_abdominal_pain", "vomiting", "mild_abdominal_pain"],
  },
  {
    name: "Left Arm",
    cx: 95,
    cy: 155,
    symptoms: ["severe_trauma", "uncontrolled_bleeding"],
  },
  {
    name: "Right Arm",
    cx: 205,
    cy: 155,
    symptoms: ["severe_trauma", "uncontrolled_bleeding"],
  },
  {
    name: "Left Leg",
    cx: 125,
    cy: 295,
    symptoms: ["mild_joint_pain", "mild_back_pain"],
  },
  {
    name: "Right Leg",
    cx: 175,
    cy: 295,
    symptoms: ["mild_joint_pain", "mild_back_pain"],
  },
  { name: "Nose", cx: 150, cy: 55, symptoms: ["runny_nose", "mild_cough"] },
];

const FULL_BODY_SYMPTOMS = [
  "seizure",
  "severe_allergic_reaction",
  "persistent_fever",
  "fatigue",
  "skin_rash",
  "dehydration",
  "body_ache",
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

// ── Male & Female SVG silhouette paths ──
const MALE_PATH =
  "M150 10 C135 10 125 20 125 35 C125 50 135 60 150 60 C165 60 175 50 175 35 C175 20 165 10 150 10 Z M140 62 L130 65 L110 75 L90 140 L95 145 L115 90 L120 110 L105 200 L110 200 L115 260 L120 340 L130 340 L135 260 L140 200 L145 200 L150 260 L155 200 L160 200 L165 260 L170 340 L180 340 L185 260 L190 200 L195 200 L180 110 L185 90 L205 145 L210 140 L190 75 L170 65 L160 62 Z";

const FEMALE_PATH =
  "M150 10 C135 10 125 20 125 35 C125 50 135 60 150 60 C165 60 175 50 175 35 C175 20 165 10 150 10 Z M140 62 L128 66 L112 78 L95 140 L100 143 L118 92 L120 110 L108 170 L115 180 L105 200 L110 200 L118 260 L122 340 L132 340 L136 260 L140 200 L145 200 L150 260 L155 200 L160 200 L164 260 L168 340 L178 340 L182 260 L190 200 L195 200 L185 180 L192 170 L180 110 L182 92 L200 143 L205 140 L188 78 L172 66 L160 62 Z";

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
// HumanBody SVG Component
// ────────────────────────────
function HumanBodySVG({ item, editable = false, onSymptomToggle }) {
  const [tooltip, setTooltip] = useState(null);
  const activeSymptoms = getActiveSymptoms(item);
  const isFemale = (item.patient_gender || "").toLowerCase() === "female";

  return (
    <div className="body-svg-container">
      <svg viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg">
        {/* Soft body glow */}
        <defs>
          <radialGradient id="bodyGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="150" cy="200" rx="110" ry="180" fill="url(#bodyGlow)" />

        {/* Silhouette */}
        <path
          d={isFemale ? FEMALE_PATH : MALE_PATH}
          fill="#f1f5f9"
          stroke="#cbd5e1"
          strokeWidth="2"
        />

        {/* Region markers */}
        {BODY_REGIONS.map((region) => {
          const matched = region.symptoms.filter((s) =>
            activeSymptoms.includes(s),
          );

          const severity = getRegionSeverity(activeSymptoms, region.symptoms);
          const color = severityColor(severity || "mild");

          return (
            <g key={region.name}>
              <circle
                cx={region.cx}
                cy={region.cy}
                r="12"
                fill={matched.length ? color : "#e2e8f0"}
                stroke="#64748b"
                strokeWidth="1"
                className="body-marker"
                style={{ cursor: editable ? "pointer" : "default" }}
                onClick={() => {
                  if (!editable) return;
                  region.symptoms.forEach((s) => onSymptomToggle?.(s));
                }}
                onMouseEnter={() =>
                  setTooltip({
                    x: region.cx,
                    y: region.cy - 18,
                    text:
                      region.name +
                      ": " +
                      region.symptoms.map(symptomLabel).join(", "),
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            </g>
          );
        })}
      </svg>

      {tooltip && (
        <div
          className="marker-tooltip"
          style={{
            left: `${(tooltip.x / 300) * 100}%`,
            top: `${(tooltip.y / 400) * 100}%`,
          }}
        >
          {tooltip.text}
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
  const [tab, setTab] = useState("all"); // all | triage | emergency
  const [selected, setSelected] = useState(null); // { type, data }
  const [showResolve, setShowResolve] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);
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

  // ── Select a card ──
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

  // ── Resolve triage ──
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

  // ── Convert emergency ──
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

  // ── Edit history ──
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
        `${API}/api/patient/${selected.data.patient_id}/history/`,
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
        // Update local state
        const updatePatientFields = (item) => {
          const updated = { ...item };
          HISTORY_BOOLEANS.forEach((f) => {
            updated[`patient_${f}`] = historyForm[f];
          });
          updated.patient_allergies = historyForm.allergies;
          updated.patient_past_surgeries = historyForm.past_surgeries;
          return updated;
        };

        if (selected.type === "triage") {
          setTriageList((prev) =>
            prev.map((t) =>
              t.id === selected.data.id ? updatePatientFields(t) : t,
            ),
          );
        } else {
          setEmergencyList((prev) =>
            prev.map((e) =>
              e.id === selected.data.id ? updatePatientFields(e) : e,
            ),
          );
        }
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

  // ── Filter items for list view ──
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

  // ────────────────────────────
  // DETAIL VIEW
  // ────────────────────────────
  if (selected) {
    const item = selected.data;
    const isTriage = selected.type === "triage";
    const activeSymptoms = isTriage ? getActiveSymptoms(item) : [];

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
            {/* Left: Body SVG (triage only) */}
            {isTriage && (
              <div className="detail-left">
                <HumanBodySVG
                  item={item}
                  editable={true}
                  onSymptomToggle={(symptom) => {
                    setSelected((prev) => {
                      const updated = { ...prev.data };
                      updated[symptom] = !updated[symptom];
                      return { ...prev, data: updated };
                    });
                  }}
                />
              </div>
            )}

            {/* Right: Info */}
            <div className="detail-right">
              {/* Patient info card */}
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

                {isTriage && item.recommended_department && (
                  <div className="patient-info-row">
                    <span className="label">Department:</span>
                    <span className="value" style={{ color: "#4361ee" }}>
                      {item.recommended_department.replace(/_/g, " ")}
                    </span>
                  </div>
                )}
                {!isTriage && item.department && (
                  <div className="patient-info-row">
                    <span className="label">Department:</span>
                    <span className="value" style={{ color: "#e74c5a" }}>
                      {item.department.replace(/_/g, " ")}
                    </span>
                  </div>
                )}

                {item.patient_allergies && (
                  <div className="patient-info-row">
                    <span className="label">Allergies:</span>
                    <span className="value">{item.patient_allergies}</span>
                  </div>
                )}
                {item.patient_past_surgeries && (
                  <div className="patient-info-row">
                    <span className="label">Past Surgeries:</span>
                    <span className="value">{item.patient_past_surgeries}</span>
                  </div>
                )}

                {/* Medical history booleans */}
                {HISTORY_BOOLEANS.some((f) => item[`patient_${f}`]) && (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#9ca3af",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        marginBottom: 6,
                      }}
                    >
                      Medical History
                    </div>
                    <div className="symptom-tags">
                      {HISTORY_BOOLEANS.filter((f) => item[`patient_${f}`]).map(
                        (f) => (
                          <span key={f} className="symptom-tag moderate">
                            {symptomLabel(f)}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Vitals (triage only) */}
              {isTriage && (
                <div className="vitals-grid">
                  <div className="vital-item">
                    <div className="vital-label">Systolic BP</div>
                    <div className="vital-value">{item.systolic_bp}</div>
                  </div>
                  <div className="vital-item">
                    <div className="vital-label">Heart Rate</div>
                    <div className="vital-value">{item.heart_rate}</div>
                  </div>
                  <div className="vital-item">
                    <div className="vital-label">Temp</div>
                    <div className="vital-value">{item.temperature}</div>
                  </div>
                  <div className="vital-item">
                    <div className="vital-label">SpO2</div>
                    <div className="vital-value">{item.oxygen}%</div>
                  </div>
                </div>
              )}

              {/* Active symptoms (triage only) */}
              {isTriage && activeSymptoms.length > 0 && (
                <div className="symptoms-detail">
                  <h4>Active Symptoms</h4>
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

              {/* Action buttons */}
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
                <button
                  className="action-edit-history"
                  onClick={openEditHistory}
                >
                  Edit History
                </button>
              </div>

              {/* Resolve confirmation */}
              {showResolve && (
                <div className="resolve-confirm">
                  <p>
                    Resolve triage for <strong>{item.patient_name}</strong>?
                    This cannot be undone.
                  </p>
                  <div className="resolve-confirm-actions">
                    <button
                      className="resolve-yes"
                      onClick={handleResolve}
                      disabled={actionLoading}
                    >
                      {actionLoading ? "Resolving..." : "Yes, Resolve"}
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

              {/* Convert form */}
              {showConvert && (
                <div className="convert-form">
                  <h4>Enter Vitals & Symptoms to Convert</h4>

                  <div className="vitals-form">
                    {[
                      { key: "systolic_bp", label: "Systolic BP" },
                      { key: "heart_rate", label: "Heart Rate" },
                      { key: "temperature", label: "Temperature" },
                      { key: "oxygen", label: "SpO2 %" },
                    ].map((v) => (
                      <div className="form-field" key={v.key}>
                        <label>{v.label}</label>
                        <input
                          type="number"
                          value={convertForm[v.key]}
                          onChange={(e) =>
                            setConvertForm((prev) => ({
                              ...prev,
                              [v.key]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="symptoms-section">
                    <h4>Critical Symptoms</h4>
                    <div className="checkbox-grid">
                      {CRITICAL_SYMPTOMS.map((s) => (
                        <label className="checkbox-label" key={s}>
                          <input
                            type="checkbox"
                            checked={!!convertSymptoms[s]}
                            onChange={(e) =>
                              setConvertSymptoms((prev) => ({
                                ...prev,
                                [s]: e.target.checked,
                              }))
                            }
                          />
                          {symptomLabel(s)}
                        </label>
                      ))}
                    </div>
                    <h4>Moderate Symptoms</h4>
                    <div className="checkbox-grid">
                      {MODERATE_SYMPTOMS.map((s) => (
                        <label className="checkbox-label" key={s}>
                          <input
                            type="checkbox"
                            checked={!!convertSymptoms[s]}
                            onChange={(e) =>
                              setConvertSymptoms((prev) => ({
                                ...prev,
                                [s]: e.target.checked,
                              }))
                            }
                          />
                          {symptomLabel(s)}
                        </label>
                      ))}
                    </div>
                    <h4>Mild Symptoms</h4>
                    <div className="checkbox-grid">
                      {SYMPTOM_FIELDS.filter(
                        (s) =>
                          !CRITICAL_SYMPTOMS.includes(s) &&
                          !MODERATE_SYMPTOMS.includes(s),
                      ).map((s) => (
                        <label className="checkbox-label" key={s}>
                          <input
                            type="checkbox"
                            checked={!!convertSymptoms[s]}
                            onChange={(e) =>
                              setConvertSymptoms((prev) => ({
                                ...prev,
                                [s]: e.target.checked,
                              }))
                            }
                          />
                          {symptomLabel(s)}
                        </label>
                      ))}
                    </div>
                  </div>

                  <button
                    className="convert-submit"
                    onClick={handleConvert}
                    disabled={
                      actionLoading ||
                      !convertForm.systolic_bp ||
                      !convertForm.heart_rate ||
                      !convertForm.temperature ||
                      !convertForm.oxygen
                    }
                  >
                    {actionLoading ? "Converting..." : "Convert to Inpatient"}
                  </button>
                </div>
              )}

              {/* Edit history form */}
              {showEditHistory && (
                <div className="edit-history-form">
                  <h4>Edit Patient Medical History</h4>
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
                      value={historyForm.allergies || ""}
                      onChange={(e) =>
                        setHistoryForm((prev) => ({
                          ...prev,
                          allergies: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="edit-history-text">
                    <label>Past Surgeries</label>
                    <textarea
                      rows={2}
                      value={historyForm.past_surgeries || ""}
                      onChange={(e) =>
                        setHistoryForm((prev) => ({
                          ...prev,
                          past_surgeries: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <button
                    className="history-save-btn"
                    onClick={handleSaveHistory}
                    disabled={actionLoading}
                  >
                    {actionLoading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ────────────────────────────
  // LIST VIEW
  // ────────────────────────────
  const items = filteredItems();

  return (
    <div className="doctor-page">
      <header className="doctor-header">
        <div className="doctor-header-left">
          <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
          <span>Apex Health</span>
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
        {/* Tab filter */}
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

        {items.length === 0 ? (
          <p className="no-data">No assigned patients.</p>
        ) : (
          <div className="triage-grid">
            {items.map(({ type, data }) => {
              const isTriage = type === "triage";
              const activeSymptoms = isTriage ? getActiveSymptoms(data) : [];
              return (
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
                        {data.patient_blood_group
                          ? ` | ${data.patient_blood_group}`
                          : ""}
                      </div>
                    </div>
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      {isTriage ? (
                        <>
                          <span className="triage-badge">Triage</span>
                          <span
                            className={`risk-badge ${riskClass(data.predicted_risk)}`}
                          >
                            {data.predicted_risk || "N/A"}
                          </span>
                        </>
                      ) : (
                        <span className="emergency-badge">Emergency</span>
                      )}
                    </div>
                  </div>

                  {/* Vitals for triage */}
                  {isTriage && (
                    <div className="vitals-grid">
                      <div className="vital-item">
                        <div className="vital-label">BP</div>
                        <div className="vital-value">{data.systolic_bp}</div>
                      </div>
                      <div className="vital-item">
                        <div className="vital-label">HR</div>
                        <div className="vital-value">{data.heart_rate}</div>
                      </div>
                      <div className="vital-item">
                        <div className="vital-label">Temp</div>
                        <div className="vital-value">{data.temperature}</div>
                      </div>
                      <div className="vital-item">
                        <div className="vital-label">SpO2</div>
                        <div className="vital-value">{data.oxygen}%</div>
                      </div>
                    </div>
                  )}

                  {/* Symptom preview for triage */}
                  {isTriage && activeSymptoms.length > 0 && (
                    <div className="symptom-tags" style={{ marginBottom: 12 }}>
                      {activeSymptoms.slice(0, 4).map((s) => (
                        <span
                          key={s}
                          className={`symptom-tag ${symptomSeverity(s)}`}
                        >
                          {symptomLabel(s)}
                        </span>
                      ))}
                      {activeSymptoms.length > 4 && (
                        <span className="symptom-tag mild">
                          +{activeSymptoms.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  <div className="triage-card-footer">
                    <span className="department">
                      {(isTriage
                        ? data.recommended_department
                        : data.department || ""
                      ).replace(/_/g, " ")}
                    </span>
                    <span className="timestamp">
                      {data.created_at
                        ? new Date(data.created_at).toLocaleString()
                        : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default DoctorDashboard;
