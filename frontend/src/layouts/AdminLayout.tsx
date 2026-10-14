import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { getCurrentUser, logout } from "../api/auth";
import type { User } from "../api/auth";

export default function AdminLayout() {
  const [user, setUser] = useState<User | null>(null);
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
      <aside className="sidebar admin-sidebar">
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
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/admin/requests"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            Service requests
          </NavLink>

          <NavLink
            to="/admin/technicians"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            Technicians
          </NavLink>

          <NavLink
            to="/admin/jobs"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            Jobs
          </NavLink>

          <NavLink
            to="/admin/evidence"
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
          <strong>Company Console</strong>

          <button
            type="button"
            onClick={handleLogout}
            className="logout-button"
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
