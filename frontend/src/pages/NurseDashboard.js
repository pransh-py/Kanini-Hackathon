import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./NurseDashboard.css";

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

function getRiskClass(risk) {
  if (!risk) return "risk-unknown";
  const r = risk.toLowerCase();
  if (r === "high" || r === "critical") return "risk-high";
  if (r === "moderate" || r === "medium") return "risk-moderate";
  if (r === "low") return "risk-low";
  return "risk-unknown";
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

function NurseDashboard() {
  const [data, setData] = useState([]);
  const [nurseName, setNurseName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Protect route + get nurse name
  useEffect(() => {
    fetch("http://localhost:8000/api/user-role/", {
      credentials: "include",
    })
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

  // Load dashboard data
  useEffect(() => {
    fetch("http://localhost:8000/api/nurse-dashboard/", {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((result) => {
        if (Array.isArray(result)) setData(result);
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

  if (loading) return <div className="nurse-loading">Loading...</div>;

  return (
    <div className="nurse-page">
      {/* Header */}
      <header className="nurse-header">
        <div className="nurse-header-left">
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

      {/* Main */}
      <main className="nurse-main">
        {/* Action Buttons */}
        <div className="nurse-actions">
          <button
            className="action-btn action-btn-emergency"
            onClick={() => navigate("/nurse/emergency")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            Emergency Cases
          </button>
          <button
            className="action-btn action-btn-inpatient"
            onClick={() => navigate("/nurse/inpatients")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Inpatients
          </button>
        </div>

        {/* Triage Requests */}
        <h2 className="section-title"> Requests</h2>

        {data.length === 0 ? (
          <p className="no-data">No requests found.</p>
        ) : (
          <div className="triage-grid">
            {data.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className={`triage-card ${
                  item.type === "emergency" ? "emergency-card" : ""
                }`}
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
                    className={`risk-badge ${
                      item.type === "emergency"
                        ? "risk-high"
                        : getRiskClass(item.predicted_risk)
                    }`}
                  >
                    {item.type === "emergency"
                      ? "EMERGENCY"
                      : item.predicted_risk || "Pending"}
                  </span>
                </div>

                {item.type === "triage" && (
                  <div className="vitals-grid">
                    <div className="vital-item">
                      <div className="vital-label">BP</div>
                      <div className="vital-value">
                        {item.systolic_bp || "—"}
                      </div>
                    </div>
                    <div className="vital-item">
                      <div className="vital-label">HR</div>
                      <div className="vital-value">
                        {item.heart_rate || "—"}
                      </div>
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
                )}

                <div className="triage-card-footer">
                  <span className="department">
                    {item.type === "emergency"
                      ? item.department || "Emergency"
                      : item.recommended_department || "Unassigned"}
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

export default NurseDashboard;
