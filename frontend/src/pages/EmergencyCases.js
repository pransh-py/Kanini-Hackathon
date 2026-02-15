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

const DEPARTMENTS = [
  "Emergency",
  "General_Medicine",
  "Cardiology",
  "Neurology",
  "Pulmonology",
  "Gastroenterology",
  "Orthopedics",
  "Pediatrics",
  "Nephrology",
  "Endocrinology",
];

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

function EmergencyCases() {
  const [nurseName, setNurseName] = useState("");
  const navigate = useNavigate();

  // Patient states
  const [patientType, setPatientType] = useState("existing");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [newPatient, setNewPatient] = useState({ ...EMPTY_PATIENT });
  const [saving, setSaving] = useState(false);

  // Input mode: "voice" | "manual"
  const [inputMode, setInputMode] = useState(null);

  // Symptoms text (shared between voice and manual)
  const [transcript, setTranscript] = useState("");

  // Voice states
  const [isListening, setIsListening] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [translating, setTranslating] = useState(false);

  // Triage states
  const [triageResult, setTriageResult] = useState(null);
  const [triageLoading, setTriageLoading] = useState(false);

  // Confirmation states
  const [chosenDepartment, setChosenDepartment] = useState("");
  const [overrideMode, setOverrideMode] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

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

  const handleLogout = async () => {
    const csrfToken = getCookie("csrftoken");
    await fetch("http://localhost:8000/api/logout/", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRFToken": csrfToken },
    });
    navigate("/");
  };

  // ---------- Patient Search ----------
  useEffect(() => {
    if (patientType !== "existing" || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(
        `http://localhost:8000/api/patient/search/?q=${encodeURIComponent(searchQuery)}`,
        { credentials: "include" },
      )
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setSearchResults(data);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, patientType]);

  const selectPatient = (patient) => {
    setSelectedPatient(patient);
    setSearchQuery("");
    setSearchResults([]);
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
      } else {
        setErrorMsg(result.error || "Failed to create patient.");
      }
    } catch {
      setErrorMsg("Error connecting to server.");
    }
    setSaving(false);
  };

  // ---------- Voice Recording ----------
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
          const data = await response.json();
          if (data.translated_text) {
            setTranscript(data.translated_text);
          } else {
            setErrorMsg(data.error || "Transcription failed. Try recording again.");
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

  // ---------- Triage Submit ----------
  const handleTriageSubmit = async () => {
    if (!transcript.trim()) return;
    setTriageLoading(true);
    setTriageResult(null);
    try {
      const csrfToken = getCookie("csrftoken");
      const res = await fetch("http://localhost:8000/api/triage/", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({ symptoms: transcript }),
      });
      const result = await res.json();
      setTriageResult(result);
    } catch {
      setTriageResult({ error: "Failed to reach server." });
    }
    setTriageLoading(false);
  };

  const clearAll = () => {
    setTranscript("");
    setTriageResult(null);
    setChosenDepartment("");
    setOverrideMode(false);
    setDoctors([]);
    setSelectedDoctor(null);
    setConfirmed(null);
    setErrorMsg("");
  };

  // ---------- Fetch doctors ----------
  useEffect(() => {
    if (!chosenDepartment) {
      setDoctors([]);
      setSelectedDoctor(null);
      return;
    }
    fetch(
      `http://localhost:8000/api/doctors/?department=${encodeURIComponent(chosenDepartment)}`,
      { credentials: "include" },
    )
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setDoctors(data);
          // Auto-select least-loaded doctor (API returns sorted by patient_count)
          if (!overrideMode && data.length > 0) {
            setSelectedDoctor(data[0]);
          }
        }
      })
      .catch(() => {});
  }, [chosenDepartment, overrideMode]);

  useEffect(() => {
    if (
      triageResult &&
      !triageResult.error &&
      triageResult.assigned_department
    ) {
      setChosenDepartment(triageResult.assigned_department);
      setOverrideMode(false);
      setConfirmed(null);
    }
  }, [triageResult]);

  // ---------- Confirm Assignment ----------
  const handleConfirm = async () => {
    if (!selectedDoctor || !chosenDepartment || !selectedPatient) return;
    setConfirming(true);
    setErrorMsg("");
    try {
      const csrfToken = getCookie("csrftoken");
      const res = await fetch("http://localhost:8000/api/emergency/confirm/", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          doctor_id: selectedDoctor.id,
          department: chosenDepartment,
          symptoms: transcript,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setConfirmed(result);
      } else {
        setErrorMsg(result.error || "Failed to confirm.");
      }
    } catch {
      setErrorMsg("Error connecting to server.");
    }
    setConfirming(false);
  };

  // ---------- Render helpers ----------
  const renderPatientSelection = () => (
    <>
      <h2 className="section-title">Patient</h2>
      {!selectedPatient ? (
        <>
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
              {searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <p className="no-results">No patients found.</p>
              )}
            </div>
          )}

          {patientType === "new" && renderNewPatientForm()}
        </>
      ) : (
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
          <button
            className="voice-btn voice-btn-clear"
            onClick={() => {
              setSelectedPatient(null);
              setInputMode(null);
              clearAll();
            }}
          >
            Change Patient
          </button>
        </div>
      )}
    </>
  );

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

  const renderInputModeSelector = () => (
    <div style={{ marginTop: 24 }}>
      <h2 className="section-title" style={{ color: "#e74c5a" }}>
        Symptom Input
      </h2>
      <div className="patient-toggle">
        <button
          className={`toggle-btn ${inputMode === "manual" ? "active" : ""}`}
          onClick={() => {
            setInputMode("manual");
            clearAll();
          }}
        >
          Manual Entry
        </button>
        <button
          className={`toggle-btn ${inputMode === "voice" ? "active" : ""}`}
          onClick={() => {
            setInputMode("voice");
            clearAll();
          }}
        >
          Voice Input
        </button>
      </div>
    </div>
  );

  const renderManualInput = () => (
    <div className="voice-transcript" style={{ marginTop: 16 }}>
      <label>Describe Symptoms:</label>
      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={4}
        placeholder="Type the patient's symptoms here..."
      />
      <button
        className="voice-btn voice-btn-submit"
        onClick={handleTriageSubmit}
        disabled={triageLoading || !transcript.trim()}
      >
        {triageLoading ? "Analyzing..." : "Analyze Symptoms"}
      </button>
    </div>
  );

  const renderVoiceInput = () => (
    <>
      <div className="voice-controls" style={{ marginTop: 16 }}>
        {isListening ? (
          <button className="voice-btn voice-btn-stop" onClick={stopListening}>
            Stop Recording
          </button>
        ) : (
          <button
            className="voice-btn voice-btn-start"
            onClick={startListening}
          >
            Start Recording
          </button>
        )}
        {transcript && (
          <button className="voice-btn voice-btn-clear" onClick={clearAll}>
            Clear
          </button>
        )}
      </div>
      {isListening && <div className="voice-indicator">Listening...</div>}
      {translating && (
        <div className="voice-translating">
          <div className="translating-spinner"></div>
          <span>Translating audio...</span>
        </div>
      )}
      {transcript && (
        <div className="voice-transcript">
          <label>Translated Text:</label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
          />
          <button
            className="voice-btn voice-btn-submit"
            onClick={handleTriageSubmit}
            disabled={triageLoading}
          >
            {triageLoading ? "Analyzing..." : "Analyze Symptoms"}
          </button>
        </div>
      )}
    </>
  );

  const renderTriageResult = () => (
    <>
      {triageResult && triageResult.error && (
        <p className="voice-error">{triageResult.error}</p>
      )}

      {triageResult && !triageResult.error && !confirmed && (
        <div className="confirm-section">
          <h3 className="confirm-title">Assign Department</h3>
          <div className="confirm-recommendation">
            <span className="confirm-label">AI Recommendation:</span>
            <span className="confirm-dept-name">
              {chosenDepartment.replace(/_/g, " ")}
            </span>
            <span className="confirm-confidence">
              {Math.round(triageResult.confidence * 100)}% confidence
            </span>
          </div>

          {!overrideMode ? (
            <>
              {/* Auto-assigned doctor (least loaded) */}
              {selectedDoctor && (
                <div className="auto-assign-info">
                  <span className="confirm-label">Auto-assigned Doctor:</span>
                  <span className="confirm-dept-name">
                    Dr. {selectedDoctor.name}
                  </span>
                  <span className="confirm-confidence">
                    {selectedDoctor.patient_count} current patient
                    {selectedDoctor.patient_count !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
              {!selectedDoctor && doctors.length === 0 && chosenDepartment && (
                <p className="no-results">
                  No doctors available for this department.
                </p>
              )}
              <div className="confirm-actions">
                <button
                  className="confirm-btn confirm-btn-override"
                  onClick={() => {
                    setOverrideMode(true);
                    setSelectedDoctor(null);
                  }}
                >
                  Override Department / Doctor
                </button>
              </div>
            </>
          ) : (
            <div className="override-section">
              <label className="override-label">Select Department:</label>
              <div className="dept-grid">
                {DEPARTMENTS.map((dept) => (
                  <button
                    key={dept}
                    className={`dept-btn ${chosenDepartment === dept ? "active" : ""}`}
                    onClick={() => {
                      setChosenDepartment(dept);
                      setSelectedDoctor(null);
                    }}
                  >
                    {dept.replace(/_/g, " ")}
                  </button>
                ))}
              </div>

              {chosenDepartment && (
                <div className="doctor-section">
                  <label className="doctor-label">
                    Select Doctor ({chosenDepartment.replace(/_/g, " ")}):
                  </label>
                  {doctors.length === 0 ? (
                    <p className="no-results">
                      No doctors found for this department.
                    </p>
                  ) : (
                    <div className="doctor-list">
                      {doctors.map((doc) => (
                        <div
                          key={doc.id}
                          className={`doctor-item ${selectedDoctor?.id === doc.id ? "active" : ""}`}
                          onClick={() => setSelectedDoctor(doc)}
                        >
                          <strong>{doc.name}</strong>
                          <span>{doc.department}</span>
                          <span className="doctor-load">
                            {doc.patient_count} patient
                            {doc.patient_count !== 1 ? "s" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                className="confirm-btn confirm-btn-cancel"
                onClick={() => {
                  setOverrideMode(false);
                  setChosenDepartment(triageResult.assigned_department);
                }}
              >
                Cancel Override
              </button>
            </div>
          )}

          {selectedDoctor && (
            <button
              className="confirm-btn confirm-btn-final"
              onClick={handleConfirm}
              disabled={confirming}
            >
              {confirming
                ? "Confirming..."
                : `Confirm: Dr. ${selectedDoctor.name} → ${chosenDepartment.replace(/_/g, " ")}`}
            </button>
          )}
        </div>
      )}

      {confirmed && (
        <div className="confirm-success">
          <h3>Emergency Case Confirmed</h3>
          <p>
            <strong>{confirmed.patient}</strong> assigned to{" "}
            <strong>Dr. {confirmed.doctor}</strong> in{" "}
            <strong>{confirmed.department.replace(/_/g, " ")}</strong>
          </p>
          <button
            className="confirm-btn confirm-btn-accept"
            onClick={() => {
              setSelectedPatient(null);
              setInputMode(null);
              clearAll();
            }}
          >
            New Case
          </button>
        </div>
      )}
    </>
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

        {renderPatientSelection()}

        {selectedPatient && !confirmed && (
          <>
            {renderInputModeSelector()}
            {inputMode === "manual" && renderManualInput()}
            {inputMode === "voice" && renderVoiceInput()}
            {renderTriageResult()}
          </>
        )}

        {confirmed && renderTriageResult()}
      </main>
    </div>
  );
}

export default EmergencyCases;
