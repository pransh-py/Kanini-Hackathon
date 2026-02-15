1;

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

function InpatientCases() {
  const navigate = useNavigate();

  const [nurseName, setNurseName] = useState("");

  // FORCE RESET STATES
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientType, setPatientType] = useState("existing");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const [newPatient, setNewPatient] = useState({
    full_name: "",
    age: "",
    gender: "",
  });

  const [inputMode, setInputMode] = useState(null);
  const [manualText, setManualText] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // 🔥 HARD RESET ON PAGE LOAD
  useEffect(() => {
    setSelectedPatient(null);
    setInputMode(null);
    setManualText("");
    setVoiceText("");
    setResult(null);
  }, []);

  // 🔹 Verify Nurse
  useEffect(() => {
    fetch("http://localhost:8000/api/user-role/", {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.role !== "nurse") navigate("/");
        setNurseName(data.name);
      });
  }, [navigate]);

  // 🔹 Search Existing Patients
  useEffect(() => {
    if (patientType !== "existing" || searchQuery.length < 2) {
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
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, patientType]);

  const selectPatient = (p) => {
    setSelectedPatient(p);
    setSearchQuery("");
    setSearchResults([]);
  };

  // 🔹 Register Patient
  const handleCreatePatient = async () => {
    if (!newPatient.full_name || !newPatient.age || !newPatient.gender) {
      alert("All fields required");
      return;
    }

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

    const data = await res.json();
    if (res.ok) {
      setSelectedPatient({ ...newPatient, id: data.id });
      setNewPatient({ full_name: "", age: "", gender: "" });
    } else {
      alert(data.error || "Failed");
    }
  };

  // 🔹 Voice
  const startVoice = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    setMediaRecorder(recorder);

    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "audio/webm;codecs=opus" });
      const formData = new FormData();
      formData.append("audio", blob);

      const csrfToken = getCookie("csrftoken");
      setLoading(true);

      const res = await fetch("http://localhost:8000/api/whisper/", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRFToken": csrfToken },
        body: formData,
      });

      const data = await res.json();
      setVoiceText(data.translated_text || "");
      setLoading(false);

      stream.getTracks().forEach((track) => track.stop());
    };

    recorder.start();
    setIsListening(true);
  };

  const stopVoice = () => {
    mediaRecorder.stop();
    setIsListening(false);
  };

  // 🔹 Submit
  const handleSubmit = async () => {
    let content = "";

    if (inputMode === "manual") content = manualText;
    if (inputMode === "voice") content = voiceText;

    if (!content) {
      alert("No input provided");
      return;
    }

    const csrfToken = getCookie("csrftoken");
    setLoading(true);

    const res = await fetch("http://localhost:8000/api/inpatient-analyze/", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify({
        patient_id: selectedPatient.id,
        content: content,
      }),
    });

    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  return (
    <div className="nurse-page">
      <header className="nurse-header">
        <div
          className="nurse-header-left"
          onClick={() => navigate("/nurse")}
          style={{ cursor: "pointer" }}
        >
          <svg
            viewBox="0 0 48 48"
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
          >
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
        <span>Nurse: {nurseName}</span>
      </header>

      <main className="nurse-main">
        <h2>Inpatient Case</h2>

        {/* STEP 1: FORCE PATIENT SELECTION */}
        {selectedPatient === null ? (
          <>
            <div className="patient-toggle">
              <button
                className={patientType === "existing" ? "active" : ""}
                onClick={() => setPatientType("existing")}
              >
                Existing
              </button>

              <button
                className={patientType === "new" ? "active" : ""}
                onClick={() => setPatientType("new")}
              >
                New
              </button>
            </div>

            {patientType === "existing" && (
              <>
                <input
                  placeholder="Search patient..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                {searchResults.map((p) => (
                  <div key={p.id} onClick={() => selectPatient(p)}>
                    {p.full_name} ({p.age} yrs)
                  </div>
                ))}
              </>
            )}

            {patientType === "new" && (
              <>
                <input
                  placeholder="Full Name"
                  value={newPatient.full_name}
                  onChange={(e) =>
                    setNewPatient({ ...newPatient, full_name: e.target.value })
                  }
                />
                <input
                  type="number"
                  placeholder="Age"
                  value={newPatient.age}
                  onChange={(e) =>
                    setNewPatient({ ...newPatient, age: e.target.value })
                  }
                />
                <select
                  value={newPatient.gender}
                  onChange={(e) =>
                    setNewPatient({ ...newPatient, gender: e.target.value })
                  }
                >
                  <option value="">Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>

                <button onClick={handleCreatePatient}>Register Patient</button>
              </>
            )}
          </>
        ) : (
          <>
            {/* STEP 2: INPUT OPTIONS */}
            <h3>Patient: {selectedPatient.full_name}</h3>
            <button onClick={() => setSelectedPatient(null)}>
              Change Patient
            </button>

            {!inputMode && (
              <>
                <button onClick={() => setInputMode("voice")}>Voice</button>
                <button onClick={() => setInputMode("pdf")}>PDF</button>
                <button onClick={() => setInputMode("manual")}>Manual</button>
              </>
            )}

            {inputMode === "manual" && (
              <>
                <textarea
                  rows={4}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                />
                <button onClick={handleSubmit}>Submit</button>
              </>
            )}

            {inputMode === "voice" && (
              <>
                {isListening ? (
                  <button onClick={stopVoice}>Stop</button>
                ) : (
                  <button onClick={startVoice}>Start Voice</button>
                )}

                {voiceText && (
                  <>
                    <textarea value={voiceText} readOnly />
                    <button onClick={handleSubmit}>Submit</button>
                  </>
                )}
              </>
            )}

            {inputMode === "pdf" && (
              <>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files[0])}
                />
              </>
            )}

            {loading && <p>Processing...</p>}

            {result && (
              <div>
                <h4>Result</h4>
                <pre>{JSON.stringify(result, null, 2)}</pre>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default InpatientCases;
