import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { getCurrentUser, logout } from "../api/auth";
import type { User } from "../api/auth";

export default function AdminLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getCurrentUser().then(setUser);
  }, []);

  async function handleLogout() {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  return (
    <div className="app-shell">
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar admin-sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">PW</div>

          <div>
            <strong>Proof of Work</strong>
            <span>Company Console</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-label">Operations</p>

          <NavLink
            to="/admin"
            end
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/admin/requests"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            Service requests
          </NavLink>

          <NavLink
            to="/admin/technicians"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            Technicians
          </NavLink>

          <NavLink
            to="/admin/jobs"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            Jobs
          </NavLink>

          <NavLink
            to="/admin/evidence"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            Evidence
          </NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="avatar admin-avatar">
              {user?.name?.charAt(0).toUpperCase() ?? "A"}
            </div>

            <div>
              <strong>{user?.name}</strong>
              <span>Company administrator</span>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-logout"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="mobile-topbar">
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            <span className="hamburger-box">
              <span className={`hamburger-bar ${mobileMenuOpen ? "bar-1-open" : ""}`} />
              <span className={`hamburger-bar ${mobileMenuOpen ? "bar-2-open" : ""}`} />
              <span className={`hamburger-bar ${mobileMenuOpen ? "bar-3-open" : ""}`} />
            </span>
          </button>

          <div className="mobile-topbar-brand">
            <div className="brand-mark mobile-brand-mark">PW</div>
            <strong>Company Console</strong>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="logout-button mobile-logout-btn"
          >
            Logout
          </button>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
