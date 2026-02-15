import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./NurseDashboard.css";
import "./EmergencyCases.css";

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

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const EMPTY_PATIENT = {
  full_name: "",
  age: "",
  gender: "",
  blood_group: "",
  allergies: "",
  past_surgeries: "",
  diabetes: false,
  hypertension: false,
  heart_disease: false,
  asthma: false,
  chronic_kidney_disease: false,
  previous_stroke: false,
  smoker: false,
  obese: false,
  previous_heart_attack: false,
  previous_hospitalization: false,
};

// Keyword map: text → symptom checkbox keys
const SYMPTOM_KEYWORDS = {
  chest_pain: ["chest pain", "chest hurts", "chest ache", "pain in chest"],
  severe_breathlessness: [
    "severe breathlessness",
    "can't breathe",
    "cannot breathe",
    "extreme difficulty breathing",
    "severe breathing",
  ],
  sudden_confusion: [
    "sudden confusion",
    "confused",
    "disoriented",
    "confusion",
  ],
  stroke_symptoms: ["stroke", "facial droop", "slurred speech", "arm weakness"],
  seizure: ["seizure", "convulsion", "fits", "fitting"],
  severe_trauma: [
    "severe trauma",
    "major injury",
    "major trauma",
    "severe injury",
  ],
  uncontrolled_bleeding: [
    "uncontrolled bleeding",
    "heavy bleeding",
    "massive bleeding",
    "bleeding won't stop",
  ],
  loss_of_consciousness: [
    "unconscious",
    "loss of consciousness",
    "passed out",
    "fainted",
    "unresponsive",
  ],
  severe_allergic_reaction: [
    "anaphylaxis",
    "severe allergic",
    "allergic reaction",
    "swelling throat",
  ],
  persistent_fever: [
    "persistent fever",
    "high fever",
    "fever",
    "temperature high",
  ],
  vomiting: ["vomiting", "throwing up", "nausea and vomiting", "puking"],
  moderate_abdominal_pain: [
    "abdominal pain",
    "stomach pain",
    "belly pain",
    "stomach ache",
  ],
  persistent_cough: [
    "persistent cough",
    "chronic cough",
    "coughing a lot",
    "keeps coughing",
  ],
  moderate_breathlessness: [
    "breathlessness",
    "shortness of breath",
    "difficulty breathing",
    "breathless",
  ],
  severe_headache: [
    "severe headache",
    "intense headache",
    "worst headache",
    "splitting headache",
  ],
  dizziness: ["dizziness", "dizzy", "lightheaded", "light headed", "vertigo"],
  dehydration: ["dehydration", "dehydrated", "very thirsty", "dry mouth"],
  palpitations: [
    "palpitations",
    "heart racing",
    "heart pounding",
    "rapid heartbeat",
  ],
  migraine: ["migraine"],
  mild_headache: ["mild headache", "headache", "slight headache", "head hurts"],
  sore_throat: ["sore throat", "throat pain", "throat hurts"],
  runny_nose: ["runny nose", "nasal congestion", "stuffy nose", "blocked nose"],
  mild_cough: ["mild cough", "cough", "slight cough", "little cough"],
  fatigue: ["fatigue", "tired", "exhausted", "weakness", "weak", "lethargic"],
  body_ache: ["body ache", "body pain", "muscle pain", "aching all over"],
  mild_abdominal_pain: [
    "mild abdominal pain",
    "mild stomach pain",
    "slight belly pain",
  ],
  skin_rash: ["skin rash", "rash", "itchy skin", "hives", "redness"],
  mild_back_pain: ["mild back pain", "back pain", "backache", "back hurts"],
  mild_joint_pain: [
    "mild joint pain",
    "joint pain",
    "joint ache",
    "knee pain",
    "elbow pain",
  ],
};

function matchSymptomsFromText(text) {
  const lower = text.toLowerCase();
  const matched = {};
  for (const [symptomKey, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matched[symptomKey] = true;
        break;
      }
    }
  }
  return matched;
}

const INITIAL_SYMPTOMS = {
  chest_pain: false,
  severe_breathlessness: false,
  sudden_confusion: false,
  stroke_symptoms: false,
  seizure: false,
  severe_trauma: false,
  uncontrolled_bleeding: false,
  loss_of_consciousness: false,
  severe_allergic_reaction: false,
  persistent_fever: false,
  vomiting: false,
  moderate_abdominal_pain: false,
  persistent_cough: false,
  moderate_breathlessness: false,
  severe_headache: false,
  dizziness: false,
  dehydration: false,
  palpitations: false,
  migraine: false,
  mild_headache: false,
  sore_throat: false,
  runny_nose: false,
  mild_cough: false,
  fatigue: false,
  body_ache: false,
  mild_abdominal_pain: false,
  skin_rash: false,
  mild_back_pain: false,
  mild_joint_pain: false,
};

function Inpatients() {
  const [data, setData] = useState([]);
  const [nurseName, setNurseName] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Flow step: "ask_pdf" | "pdf_upload" | "pdf_patient_confirm" | "patient_select" | "triage_form" | "done"
  const [step, setStep] = useState("ask_pdf");

  // PDF states
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfSuggestedName, setPdfSuggestedName] = useState("");
  const [pdfMatchedSymptoms, setPdfMatchedSymptoms] = useState({});

  // Patient states
  const [patientType, setPatientType] = useState("existing");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [newPatient, setNewPatient] = useState({ ...EMPTY_PATIENT });
  const [saving, setSaving] = useState(false);

  // Vitals
  const [vitals, setVitals] = useState({
    systolic_bp: "",
    heart_rate: "",
    temperature: "",
    oxygen: "",
  });

  // Symptoms
  const [symptoms, setSymptoms] = useState({ ...INITIAL_SYMPTOMS });

  // Voice states
  const [isListening, setIsListening] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");

  // Submit states
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  // Error state (replaces alert())
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch("http://localhost:8000/api/user-role/", { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          navigate("/");
          return null;
        }
        return res.json();
      })
      .then((roleData) => {
        if (!roleData) return;
        if (roleData.role !== "nurse") {
          navigate("/");
          return;
        }
        setNurseName(roleData.name || "");
      });
  }, [navigate]);

  useEffect(() => {
    fetch("http://localhost:8000/api/nurse-dashboard/", {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((result) => {
        if (Array.isArray(result)) {
          const inpatients = result.filter((item) => {
            const risk = (item.predicted_risk || "").toLowerCase();
            return risk === "low" || risk === "moderate" || risk === "medium";
          });
          setData(inpatients);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    const csrfToken = getCookie("csrftoken");
    await fetch("http://localhost:8000/api/logout/", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRFToken": csrfToken },
    });
    navigate("/");
  };

  // ---------- PDF Upload & Analyze ----------
  const handlePdfUpload = async () => {
    if (!pdfFile) return;
    setPdfExtracting(true);
    const formData = new FormData();
    formData.append("file", pdfFile);

    try {
      const res = await fetch("http://localhost:8000/api/inpatient-analyze/", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const result = await res.json();

      if (result.error) {
        setErrorMsg(result.error);
        setPdfExtracting(false);
        return;
      }

      // Store matched symptoms (apply after patient selection)
      if (result.matched_symptoms) {
        setPdfMatchedSymptoms(result.matched_symptoms);
      }

      // Auto-search patient name
      if (result.patient_name) {
        setPdfSuggestedName(result.patient_name);
      }

      setStep("pdf_patient_confirm");
    } catch {
      setErrorMsg("Error uploading PDF.");
    }
    setPdfExtracting(false);
  };

  // ---------- Patient Search ----------
  useEffect(() => {
    // Works for both patient_select (existing tab) and pdf_patient_confirm (manual override search)
    const isPatientSelect =
      step === "patient_select" && patientType === "existing";
    const isPdfConfirmSearch =
      step === "pdf_patient_confirm" && searchQuery.trim().length >= 2;

    if (!isPatientSelect && !isPdfConfirmSearch) {
      // Don't clear results on pdf_patient_confirm if no manual search yet (keep suggested results)
      if (step !== "pdf_patient_confirm") setSearchResults([]);
      return;
    }

    if (searchQuery.trim().length < 2) {
      if (step !== "pdf_patient_confirm") setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      fetch(
        `http://localhost:8000/api/patient/search/?q=${encodeURIComponent(searchQuery)}`,
        { credentials: "include" },
      )
        .then((res) => res.json())
        .then((d) => {
          if (Array.isArray(d)) setSearchResults(d);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, patientType, step]);

  // Auto-search when coming from PDF with suggested name
  useEffect(() => {
    if (step === "pdf_patient_confirm" && pdfSuggestedName) {
      fetch(
        `http://localhost:8000/api/patient/search/?q=${encodeURIComponent(pdfSuggestedName)}`,
        { credentials: "include" },
      )
        .then((res) => res.json())
        .then((d) => {
          if (Array.isArray(d)) setSearchResults(d);
        })
        .catch(() => {});
    }
  }, [step, pdfSuggestedName]);

  const selectPatient = (patient) => {
    setSelectedPatient(patient);
    setSearchQuery("");
    setSearchResults([]);
    // Apply stored PDF symptoms now that patient is confirmed
    if (Object.keys(pdfMatchedSymptoms).length > 0) {
      setSymptoms((prev) => ({ ...prev, ...pdfMatchedSymptoms }));
    }
    setStep("triage_form");
  };

  // ---------- New Patient ----------
  const handleNewPatientChange = (field, value) => {
    setNewPatient((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreatePatient = async () => {
    if (!newPatient.full_name.trim() || !newPatient.age || !newPatient.gender) {
      setErrorMsg("Name, age, and gender are required.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      const csrfToken = getCookie("csrftoken");
      const res = await fetch("http://localhost:8000/api/patient/create/", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify(newPatient),
      });
      const result = await res.json();
      if (res.ok) {
        setSelectedPatient({ ...newPatient, id: result.id });
        setNewPatient({ ...EMPTY_PATIENT });
        // Apply stored PDF symptoms
        if (Object.keys(pdfMatchedSymptoms).length > 0) {
          setSymptoms((prev) => ({ ...prev, ...pdfMatchedSymptoms }));
        }
        setStep("triage_form");
      } else {
        setErrorMsg(result.error || "Failed to create patient.");
      }
    } catch {
      setErrorMsg("Error connecting to server.");
    }
    setSaving(false);
  };

  // ---------- Voice (auto-tick symptoms) ----------
  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");
        setTranslating(true);
        try {
          const response = await fetch("http://localhost:8000/api/whisper/", {
            method: "POST",
            credentials: "include",
            body: formData,
          });
          const d = await response.json();
          if (d.translated_text) {
            setVoiceTranscript(d.translated_text);
            const matched = matchSymptomsFromText(d.translated_text);
            setSymptoms((prev) => ({ ...prev, ...matched }));
          } else {
            setErrorMsg(d.error || "Transcription failed.");
          }
        } catch {
          setErrorMsg("Error sending audio to server.");
        }
        setTranslating(false);
      };
      recorder.start();
      setIsListening(true);
    } catch {
      setErrorMsg("Microphone access denied.");
    }
  };

  const stopListening = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsListening(false);
    }
  };

  // ---------- Submit Triage Request ----------
  const handleSubmit = async () => {
    if (!selectedPatient) return;
    if (
      !vitals.systolic_bp ||
      !vitals.heart_rate ||
      !vitals.temperature ||
      !vitals.oxygen
    ) {
      setErrorMsg("All vitals (BP, Heart Rate, Temperature, O2) are required.");
      return;
    }
    setSubmitting(true);
    setSubmitResult(null);
    setErrorMsg("");
    try {
      const csrfToken = getCookie("csrftoken");
      const res = await fetch(
        "http://localhost:8000/api/triage-request/create/",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken,
          },
          body: JSON.stringify({
            patient_id: selectedPatient.id,
            ...vitals,
            ...symptoms,
          }),
        },
      );
      const result = await res.json();
      if (res.ok) {
        setSubmitResult(result);
        setStep("done");
      } else {
        setErrorMsg(result.error || "Failed to create triage request.");
      }
    } catch {
      setErrorMsg("Error connecting to server.");
    }
    setSubmitting(false);
  };

  const resetAll = () => {
    setStep("ask_pdf");
    setPdfFile(null);
    setPdfSuggestedName("");
    setPdfMatchedSymptoms({});
    setSelectedPatient(null);
    setSearchQuery("");
    setSearchResults([]);
    setPatientType("existing");
    setNewPatient({ ...EMPTY_PATIENT });
    setVoiceTranscript("");
    setSubmitResult(null);
    setVitals({ systolic_bp: "", heart_rate: "", temperature: "", oxygen: "" });
    setSymptoms({ ...INITIAL_SYMPTOMS });
    setErrorMsg("");
  };

  if (loading) return <div className="nurse-loading">Loading...</div>;

  // ---------- Render: New Patient Form ----------
  const renderNewPatientForm = () => (
    <div className="new-patient-form">
      <div className="form-row">
        <div className="form-field">
          <label>Full Name *</label>
          <input
            type="text"
            value={newPatient.full_name}
            onChange={(e) =>
              handleNewPatientChange("full_name", e.target.value)
            }
          />
        </div>
        <div className="form-field">
          <label>Age *</label>
          <input
            type="number"
            value={newPatient.age}
            onChange={(e) => handleNewPatientChange("age", e.target.value)}
          />
        </div>
        <div className="form-field">
          <label>Gender *</label>
          <select
            value={newPatient.gender}
            onChange={(e) => handleNewPatientChange("gender", e.target.value)}
          >
            <option value="">Select</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Blood Group</label>
          <select
            value={newPatient.blood_group}
            onChange={(e) =>
              handleNewPatientChange("blood_group", e.target.value)
            }
          >
            <option value="">Select</option>
            {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((bg) => (
              <option key={bg} value={bg}>
                {bg}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Allergies</label>
          <input
            type="text"
            value={newPatient.allergies}
            onChange={(e) =>
              handleNewPatientChange("allergies", e.target.value)
            }
            placeholder="e.g. Penicillin"
          />
        </div>
        <div className="form-field">
          <label>Past Surgeries</label>
          <input
            type="text"
            value={newPatient.past_surgeries}
            onChange={(e) =>
              handleNewPatientChange("past_surgeries", e.target.value)
            }
            placeholder="e.g. Appendectomy"
          />
        </div>
      </div>
      <div className="medical-history">
        <label className="history-heading">Medical History</label>
        <div className="checkbox-grid">
          {[
            ["diabetes", "Diabetes"],
            ["hypertension", "Hypertension"],
            ["heart_disease", "Heart Disease"],
            ["asthma", "Asthma"],
            ["chronic_kidney_disease", "Chronic Kidney Disease"],
            ["previous_stroke", "Previous Stroke"],
            ["smoker", "Smoker"],
            ["obese", "Obese"],
            ["previous_heart_attack", "Previous Heart Attack"],
            ["previous_hospitalization", "Previous Hospitalization"],
          ].map(([field, label]) => (
            <label key={field} className="checkbox-label">
              <input
                type="checkbox"
                checked={newPatient[field]}
                onChange={(e) =>
                  handleNewPatientChange(field, e.target.checked)
                }
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <button
        className="voice-btn voice-btn-submit"
        onClick={handleCreatePatient}
        disabled={saving}
      >
        {saving ? "Saving..." : "Register Patient"}
      </button>
    </div>
  );

  return (
    <div className="nurse-page">
      <header className="nurse-header">
        <div
          className="nurse-header-left"
          onClick={() => navigate("/nurse")}
          style={{ cursor: "pointer" }}
        >
          <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <rect x="18" y="4" width="12" height="30" rx="3" fill="#1a9e96" />
            <rect x="6" y="12" width="36" height="12" rx="3" fill="#1a9e96" />
            <ellipse
              cx="36"
              cy="38"
              rx="6"
              ry="3"
              fill="none"
              stroke="#1a9e96"
              strokeWidth="1.5"
            />
            <ellipse
              cx="36"
              cy="42"
              rx="6"
              ry="3"
              fill="none"
              stroke="#1a9e96"
              strokeWidth="1.5"
            />
          </svg>
          <span>Apex Health</span>
        </div>
        <div className="nurse-header-right">
          <span className="nurse-name">
            Nurse: <strong>{nurseName}</strong>
          </span>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="nurse-main">
        {/* Error Banner */}
        {errorMsg && (
          <div className="error-banner" style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg("")}
              style={{
                background: "none",
                border: "none",
                color: "#dc2626",
                cursor: "pointer",
                fontSize: 18,
                padding: "0 4px",
              }}
            >
              x
            </button>
          </div>
        )}

        {/* ===== Step 1: Ask PDF ===== */}
        {step === "ask_pdf" && (
          <>
            <h2 className="section-title">
              Do you have a medical report (PDF)?
            </h2>
            <div className="patient-toggle">
              <button
                className="toggle-btn active-green"
                onClick={() => setStep("pdf_upload")}
              >
                Yes, Upload PDF
              </button>
              <button
                className="toggle-btn"
                onClick={() => setStep("patient_select")}
              >
                No, Continue Manually
              </button>
            </div>
          </>
        )}

        {/* ===== Step 2a: PDF Upload ===== */}
        {step === "pdf_upload" && (
          <>
            <h2 className="section-title">Upload Medical Report</h2>
            <div className="assist-section">
              <div className="assist-controls">
                <input
                  type="file"
                  accept=".pdf"
                  className="search-input"
                  style={{ maxWidth: 300 }}
                  onChange={(e) => setPdfFile(e.target.files[0] || null)}
                />
                <button
                  className="voice-btn voice-btn-submit"
                  style={{ marginTop: 0 }}
                  onClick={handlePdfUpload}
                  disabled={!pdfFile || pdfExtracting}
                >
                  {pdfExtracting ? "Analyzing..." : "Upload & Analyze"}
                </button>
              </div>
              <button
                className="voice-btn voice-btn-clear"
                style={{ marginTop: 12 }}
                onClick={() => {
                  setPdfFile(null);
                  setStep("patient_select");
                }}
              >
                Skip, Continue Manually
              </button>
            </div>
          </>
        )}

        {/* ===== Step 2b: PDF Patient Confirm ===== */}
        {step === "pdf_patient_confirm" && (
          <>
            <h2 className="section-title">PDF Analyzed</h2>

            {/* Summary of what was extracted */}
            <div className="auto-assign-info" style={{ marginBottom: 16 }}>
              <span className="confirm-label">Symptoms detected:</span>
              <span className="confirm-dept-name">
                {Object.keys(pdfMatchedSymptoms).length > 0
                  ? `${Object.keys(pdfMatchedSymptoms).length} symptom${Object.keys(pdfMatchedSymptoms).length > 1 ? "s" : ""} found`
                  : "None detected"}
              </span>
              {Object.keys(pdfMatchedSymptoms).length > 0 && (
                <span className="confirm-confidence">
                  {Object.keys(pdfMatchedSymptoms)
                    .map((k) => k.replace(/_/g, " "))
                    .join(", ")}
                </span>
              )}
            </div>

            {/* Patient name from PDF */}
            {pdfSuggestedName ? (
              <>
                <div className="auto-assign-info" style={{ marginBottom: 16 }}>
                  <span className="confirm-label">Patient from report:</span>
                  <span className="confirm-dept-name">{pdfSuggestedName}</span>
                </div>

                {searchResults.length > 0 ? (
                  <>
                    <p
                      style={{
                        color: "#4b5563",
                        fontSize: 14,
                        marginBottom: 8,
                      }}
                    >
                      Is this the right patient? Select to confirm:
                    </p>
                    <div className="search-results">
                      {searchResults.map((p) => (
                        <div
                          key={p.id}
                          className="search-result-item"
                          onClick={() => selectPatient(p)}
                        >
                          <strong>{p.full_name}</strong>
                          <span>
                            {p.age} yrs · {p.gender}
                          </span>
                          {p.blood_group && <span> · {p.blood_group}</span>}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="no-results">
                    No matching patients found for "{pdfSuggestedName}".
                  </p>
                )}
              </>
            ) : (
              <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 8 }}>
                Could not detect patient name from report. Search or register
                below.
              </p>
            )}

            <div style={{ marginTop: 16 }}>
              <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 8 }}>
                Search for a different patient:
              </p>
              <div className="patient-search">
                <input
                  type="text"
                  placeholder="Search by patient name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                {searchQuery.trim().length >= 2 && searchResults.length > 0 && (
                  <div className="search-results">
                    {searchResults.map((p) => (
                      <div
                        key={p.id}
                        className="search-result-item"
                        onClick={() => selectPatient(p)}
                      >
                        <strong>{p.full_name}</strong>
                        <span>
                          {p.age} yrs · {p.gender}
                        </span>
                        {p.blood_group && <span> · {p.blood_group}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {searchQuery.trim().length >= 2 &&
                  searchResults.length === 0 && (
                    <p className="no-results">No patients found.</p>
                  )}
              </div>
            </div>

            <div className="patient-toggle" style={{ marginTop: 16 }}>
              <button
                className="toggle-btn"
                onClick={() => {
                  setStep("patient_select");
                  setPatientType("new");
                }}
              >
                Register New Patient
              </button>
            </div>
          </>
        )}

        {/* ===== Step 3: Patient Selection (manual path) ===== */}
        {step === "patient_select" && (
          <>
            <h2 className="section-title">Patient</h2>
            <div className="patient-toggle">
              <button
                className={`toggle-btn ${patientType === "existing" ? "active" : ""}`}
                onClick={() => {
                  setPatientType("existing");
                  setNewPatient({ ...EMPTY_PATIENT });
                }}
              >
                Existing Patient
              </button>
              <button
                className={`toggle-btn ${patientType === "new" ? "active" : ""}`}
                onClick={() => {
                  setPatientType("new");
                  setSearchQuery("");
                  setSearchResults([]);
                }}
              >
                New Patient
              </button>
            </div>

            {patientType === "existing" && (
              <div className="patient-search">
                <input
                  type="text"
                  placeholder="Search by patient name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                {searchResults.length > 0 && (
                  <div className="search-results">
                    {searchResults.map((p) => (
                      <div
                        key={p.id}
                        className="search-result-item"
                        onClick={() => selectPatient(p)}
                      >
                        <strong>{p.full_name}</strong>
                        <span>
                          {p.age} yrs · {p.gender}
                        </span>
                        {p.blood_group && <span> · {p.blood_group}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {searchQuery.trim().length >= 2 &&
                  searchResults.length === 0 && (
                    <p className="no-results">No patients found.</p>
                  )}
              </div>
            )}

            {patientType === "new" && renderNewPatientForm()}
          </>
        )}

        {/* ===== Step 4: Triage Form (vitals + symptoms + voice) ===== */}
        {step === "triage_form" && selectedPatient && (
          <>
            {/* Selected patient banner */}
            <div className="selected-patient">
              <div className="selected-patient-info">
                <strong>{selectedPatient.full_name}</strong>
                <span>
                  {selectedPatient.age} yrs · {selectedPatient.gender}
                </span>
                {selectedPatient.blood_group && (
                  <span> · {selectedPatient.blood_group}</span>
                )}
              </div>
              <button className="voice-btn voice-btn-clear" onClick={resetAll}>
                Change Patient
              </button>
            </div>

            <h2
              className="section-title"
              style={{ color: "#4361ee", marginTop: 24 }}
            >
              Triage Assessment
            </h2>

            {/* Voice assist */}
            <div className="assist-section">
              <h4>Voice Auto-fill</h4>
              <p className="assist-hint">
                Record voice to auto-tick symptoms. Review and adjust before
                submitting.
              </p>
              <div className="assist-controls">
                {isListening ? (
                  <button
                    className="voice-btn voice-btn-stop"
                    onClick={stopListening}
                  >
                    Stop Recording
                  </button>
                ) : (
                  <button
                    className="voice-btn voice-btn-start"
                    onClick={startListening}
                  >
                    Record Voice
                  </button>
                )}
              </div>
              {isListening && (
                <div className="voice-indicator">Listening...</div>
              )}
              {translating && (
                <div className="voice-translating">
                  <div className="translating-spinner"></div>
                  <span>Translating audio...</span>
                </div>
              )}
              {voiceTranscript && (
                <div className="voice-transcript" style={{ marginTop: 12 }}>
                  <label>
                    Transcribed Text (auto-ticked matching symptoms):
                  </label>
                  <textarea value={voiceTranscript} readOnly rows={3} />
                </div>
              )}
              {Object.keys(pdfMatchedSymptoms).length > 0 && (
                <p style={{ color: "#34d399", fontSize: 13, marginTop: 8 }}>
                  PDF auto-ticked {Object.keys(pdfMatchedSymptoms).length}{" "}
                  symptom{Object.keys(pdfMatchedSymptoms).length > 1 ? "s" : ""}{" "}
                  below.
                </p>
              )}
            </div>

            {/* Vitals */}
            <h3 style={{ color: "#1a1a2e", marginBottom: 12, marginTop: 20 }}>
              Vitals
            </h3>
            <div className="vitals-form">
              <div className="form-field">
                <label>Systolic BP *</label>
                <input
                  type="number"
                  placeholder="e.g. 120"
                  value={vitals.systolic_bp}
                  onChange={(e) =>
                    setVitals((v) => ({ ...v, systolic_bp: e.target.value }))
                  }
                />
              </div>
              <div className="form-field">
                <label>Heart Rate *</label>
                <input
                  type="number"
                  placeholder="e.g. 80"
                  value={vitals.heart_rate}
                  onChange={(e) =>
                    setVitals((v) => ({ ...v, heart_rate: e.target.value }))
                  }
                />
              </div>
              <div className="form-field">
                <label>Temperature (°F) *</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 98.6"
                  value={vitals.temperature}
                  onChange={(e) =>
                    setVitals((v) => ({ ...v, temperature: e.target.value }))
                  }
                />
              </div>
              <div className="form-field">
                <label>Oxygen (%) *</label>
                <input
                  type="number"
                  placeholder="e.g. 98"
                  value={vitals.oxygen}
                  onChange={(e) =>
                    setVitals((v) => ({ ...v, oxygen: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Symptoms */}
            <div className="symptoms-section">
              <h4>Critical Symptoms</h4>
              <div className="checkbox-grid">
                {[
                  ["chest_pain", "Chest Pain"],
                  ["severe_breathlessness", "Severe Breathlessness"],
                  ["sudden_confusion", "Sudden Confusion"],
                  ["stroke_symptoms", "Stroke Symptoms"],
                  ["seizure", "Seizure"],
                  ["severe_trauma", "Severe Trauma"],
                  ["uncontrolled_bleeding", "Uncontrolled Bleeding"],
                  ["loss_of_consciousness", "Loss of Consciousness"],
                  ["severe_allergic_reaction", "Severe Allergic Reaction"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className={`checkbox-label ${symptoms[key] ? "checkbox-matched" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={symptoms[key]}
                      onChange={(e) =>
                        setSymptoms((s) => ({ ...s, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>

              <h4>Moderate Symptoms</h4>
              <div className="checkbox-grid">
                {[
                  ["persistent_fever", "Persistent Fever"],
                  ["vomiting", "Vomiting"],
                  ["moderate_abdominal_pain", "Moderate Abdominal Pain"],
                  ["persistent_cough", "Persistent Cough"],
                  ["moderate_breathlessness", "Moderate Breathlessness"],
                  ["severe_headache", "Severe Headache"],
                  ["dizziness", "Dizziness"],
                  ["dehydration", "Dehydration"],
                  ["palpitations", "Palpitations"],
                  ["migraine", "Migraine"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className={`checkbox-label ${symptoms[key] ? "checkbox-matched" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={symptoms[key]}
                      onChange={(e) =>
                        setSymptoms((s) => ({ ...s, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>

              <h4>Mild Symptoms</h4>
              <div className="checkbox-grid">
                {[
                  ["mild_headache", "Mild Headache"],
                  ["sore_throat", "Sore Throat"],
                  ["runny_nose", "Runny Nose"],
                  ["mild_cough", "Mild Cough"],
                  ["fatigue", "Fatigue"],
                  ["body_ache", "Body Ache"],
                  ["mild_abdominal_pain", "Mild Abdominal Pain"],
                  ["skin_rash", "Skin Rash"],
                  ["mild_back_pain", "Mild Back Pain"],
                  ["mild_joint_pain", "Mild Joint Pain"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className={`checkbox-label ${symptoms[key] ? "checkbox-matched" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={symptoms[key]}
                      onChange={(e) =>
                        setSymptoms((s) => ({ ...s, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <button
              className="voice-btn voice-btn-submit"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Submitting..." : "Submit Triage Request"}
            </button>
          </>
        )}

        {/* ===== Step 5: Done ===== */}
        {step === "done" && submitResult && (
          <div className="confirm-success" style={{ marginTop: 20 }}>
            <h3>Triage Request Created</h3>
            <p>
              <strong>Patient:</strong> {submitResult.patient}
            </p>
            {submitResult.recommended_department && (
              <p>
                <strong>Department:</strong>{" "}
                {submitResult.recommended_department.replace(/_/g, " ")}
              </p>
            )}
            {submitResult.predicted_risk && (
              <p>
                <strong>Risk Level:</strong> {submitResult.predicted_risk}
              </p>
            )}
            {submitResult.assigned_doctor && (
              <p>
                <strong>Assigned Doctor:</strong> Dr.{" "}
                {submitResult.assigned_doctor}
              </p>
            )}
            <button
              className="confirm-btn confirm-btn-accept"
              onClick={resetAll}
            >
              New Case
            </button>
          </div>
        )}

        {/* ===== Existing inpatient records ===== */}
        <h2
          className="section-title"
          style={{ color: "#4361ee", marginTop: 32 }}
        >
          Inpatient Records
        </h2>
        {data.length === 0 ? (
          <p className="no-data">No inpatient cases found.</p>
        ) : (
          <div className="triage-grid">
            {data.map((item) => (
              <div
                key={item.id}
                className="triage-card"
                style={{ borderColor: "#c7d2fe" }}
              >
                <div className="triage-card-header">
                  <div>
                    <div className="patient-name">
                      {item.patient_name || `Patient #${item.id}`}
                    </div>
                    <div className="patient-meta">
                      {item.patient_age && `${item.patient_age} yrs`}
                      {item.patient_gender && ` · ${item.patient_gender}`}
                    </div>
                  </div>
                  <span
                    className={`risk-badge ${(item.predicted_risk || "").toLowerCase() === "low" ? "risk-low" : "risk-moderate"}`}
                  >
                    {item.predicted_risk || "Pending"}
                  </span>
                </div>
                <div className="vitals-grid">
                  <div className="vital-item">
                    <div className="vital-label">BP</div>
                    <div className="vital-value">{item.systolic_bp || "—"}</div>
                  </div>
                  <div className="vital-item">
                    <div className="vital-label">HR</div>
                    <div className="vital-value">{item.heart_rate || "—"}</div>
                  </div>
                  <div className="vital-item">
                    <div className="vital-label">Temp</div>
                    <div className="vital-value">
                      {item.temperature ? `${item.temperature}°` : "—"}
                    </div>
                  </div>
                  <div className="vital-item">
                    <div className="vital-label">O2</div>
                    <div className="vital-value">
                      {item.oxygen ? `${item.oxygen}%` : "—"}
                    </div>
                  </div>
                </div>
                <div className="triage-card-footer">
                  <span className="department">
                    {item.recommended_department || "Unassigned"}
                  </span>
                  <span className="timestamp">
                    {formatDate(item.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default Inpatients;
