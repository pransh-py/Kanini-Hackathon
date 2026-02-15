import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DnaAnimation from "../components/DnaAnimation";
import "./Login.css";

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

function Login() {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();

  // Auto redirect if already logged in
  useEffect(() => {
    fetch("http://localhost:8000/api/user-role/", {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!data) return;

        if (data.role === "nurse") navigate("/nurse");
        if (data.role === "doctor") navigate("/doctor");
      })
      .catch(() => {});
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const csrfToken = getCookie("csrftoken");

      const response = await fetch("http://localhost:8000/api/login/", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({ employee_id: employeeId, password }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      const roleResponse = await fetch("http://localhost:8000/api/user-role/", {
        credentials: "include",
      });

      const roleData = await roleResponse.json();

      if (roleData.role === "nurse") navigate("/nurse");
      else if (roleData.role === "doctor") navigate("/doctor");
      else setError("No role assigned");
    } catch {
      setError("Server error. Try again.");
    }
  };

  return (
    <div className="login-page">
      {/* Mobile-only: DNA animation as full-screen background */}
      <div className="login-mobile-bg">
        <DnaAnimation />
      </div>

      {/* Desktop: DNA animation in left panel */}
      <div className="login-left">
        <DnaAnimation />
      </div>

      {/* Right panel — form */}
      <div className="login-right">
        {/* Logo icon */}
        <div className="login-logo">
          <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <rect x="18" y="4" width="12" height="30" rx="3" fill="rgb(17,154,145)" />
            <rect x="6" y="12" width="36" height="12" rx="3" fill="rgb(17,154,145)" />
            <ellipse
              cx="36"
              cy="38"
              rx="6"
              ry="3"
              fill="none"
              stroke="rgb(17,154,145)"
              strokeWidth="1.5"
            />
            <ellipse
              cx="36"
              cy="42"
              rx="6"
              ry="3"
              fill="none"
              stroke="rgb(17,154,145)"
              strokeWidth="1.5"
            />
          </svg>
          <div class="abcd">
          <h1>Apex Health</h1>
          <p>Medicine Redefined</p>
          </div>
        </div>

        {/* Login form card */}
        <div className="login-card">
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Employee ID</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="e.g. EMP-A1B2C3"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && <p className="login-error">{error}</p>}

            <button type="submit" className="login-btn">
              Login
            </button>
          </form>
        </div>

        {/* Branding */}
      </div>
    </div>
  );
}

export default Login;
