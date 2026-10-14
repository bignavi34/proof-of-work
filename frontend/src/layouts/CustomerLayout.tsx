import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { getCurrentUser, logout } from "../api/auth";
import type { User } from "../api/auth";

export default function CustomerLayout() {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadUser() {
      try {
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.role !== "customer") {
          navigate("/dashboard", { replace: true });
          return;
        }

        setUser(currentUser);
      } catch (error) {
        console.error("Failed to load customer:", error);
        navigate("/login", { replace: true });
      }
    }

    loadUser();
  }, [navigate]);

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
      <aside className="sidebar customer-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">PW</div>

          <div>
            <strong>Proof of Work</strong>
            <span>Customer portal</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-label">Overview</p>

          <NavLink
            to="/customer"
            end
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/customer/requests"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            My requests
          </NavLink>

          <NavLink
            to="/customer/jobs"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            My jobs
          </NavLink>

          <NavLink
            to="/customer/completed"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            Completed work
          </NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="avatar">
              {user?.name?.charAt(0).toUpperCase() ?? "U"}
            </div>

            <div>
              <strong>{user?.name ?? "Customer"}</strong>
              <span>{user?.email ?? "Loading..."}</span>
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
          <strong>Proof of Work</strong>

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
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
