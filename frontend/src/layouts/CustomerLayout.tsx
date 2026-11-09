import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { getCurrentUser, logout } from "../api/auth";
import type { User } from "../api/auth";

export default function CustomerLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar customer-sidebar ${mobileMenuOpen ? "open" : ""}`}>
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
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/customer/requests"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            My requests
          </NavLink>

          <NavLink
            to="/customer/jobs"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            My jobs
          </NavLink>

          <NavLink
            to="/customer/completed"
            onClick={() => setMobileMenuOpen(false)}
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
            <strong>Proof of Work</strong>
          </div>

          <button
            type="button"
            className="logout-button mobile-logout-btn"
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
