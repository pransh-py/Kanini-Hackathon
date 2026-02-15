import { useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  {
    key: "dashboard",
    label: "Dashboard",
    path: "/nurse",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 13.5 12 4l9 9.5" />
        <path d="M5 11.8V20h14v-8.2" />
      </svg>
    ),
  },
  {
    key: "emergency",
    label: "Emergency",
    path: "/nurse/emergency",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22 12h-4l-3 9-6-18-3 9H2" />
      </svg>
    ),
  },
  {
    key: "inpatients",
    label: "Inpatients",
    path: "/nurse/inpatients",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M9 22v-8h6v8" />
      </svg>
    ),
  },
];

function NurseBottomNav({ active }) {
  const navigate = useNavigate();

  return (
    <nav className="nurse-bottom-nav" aria-label="Nurse navigation">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`nurse-bottom-tab ${active === item.key ? "active" : ""}`}
          onClick={() => navigate(item.path)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default NurseBottomNav;
