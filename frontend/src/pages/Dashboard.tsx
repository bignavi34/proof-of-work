import { useEffect, useState } from "react";
import { logout } from "../api/client";

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  auth_provider: string;
}

const jobs = [
  {
    id: "JOB-1024",
    customer: "Rahul Sharma",
    service: "AC Service",
    technician: "Amit Kumar",
    status: "Completed",
    date: "Today, 4:20 PM",
  },
  {
    id: "JOB-1023",
    customer: "Priya Das",
    service: "AC Repair",
    technician: "Rohit Singh",
    status: "In progress",
    date: "Today, 3:05 PM",
  },
  {
    id: "JOB-1022",
    customer: "Ankit Roy",
    service: "AC Installation",
    technician: "Amit Kumar",
    status: "Pending",
    date: "Today, 1:40 PM",
  },
  {
    id: "JOB-1021",
    customer: "Neha Gupta",
    service: "AC Service",
    technician: "Sourav Das",
    status: "Completed",
    date: "Yesterday, 6:10 PM",
  },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const response = await fetch(
        "http://localhost:8000/users/me",
        {
          credentials: "include",
        },
      );

      if (response.ok) {
        const data: User = await response.json();
        setUser(data);
      }
    }

    loadUser();
  }, []);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await logout();
      window.location.href = "/login";
    } finally {
      setLoggingOut(false);
    }
  }

  const displayName = user?.name || "there";
  const initials = user ? getInitials(user.name) : "PW";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">PW</div>

          <div>
            <strong>Proof of Work</strong>
            <span>Service operations</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <a
            className="nav-item active"
            href="/dashboard"
          >
            <span>▦</span>
            Dashboard
          </a>

          <a className="nav-item" href="#">
            <span>▤</span>
            Jobs
          </a>

          <a className="nav-item" href="#">
            <span>◉</span>
            Evidence
          </a>

          <a className="nav-item" href="#">
            <span>♙</span>
            Team
          </a>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-help">
            <span className="help-icon">?</span>

            <div>
              <strong>Need help?</strong>
              <span>Contact your administrator</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h2>Dashboard</h2>
          </div>

          <div className="profile-wrapper">
            <button
              className="profile-button"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <div className="avatar">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                  />
                ) : (
                  initials
                )}
              </div>

              <div className="profile-name">
                <strong>{user?.name || "Loading..."}</strong>
                <span>Administrator</span>
              </div>

              <span className="profile-chevron">⌄</span>
            </button>

            {menuOpen && (
              <div className="profile-menu">
                <div className="profile-menu-email">
                  {user?.email}
                </div>

                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  {loggingOut ? "Logging out..." : "Log out"}
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="dashboard-container">
          <section className="welcome-section">
            <div>
              <p className="eyebrow">Overview</p>

              <h1>
                Good evening, {displayName.split(" ")[0]}.
              </h1>

              <p>
                Here's what's happening with your service
                operations.
              </p>
            </div>

            <button className="primary-button">
              + Create job
            </button>
          </section>

          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-header">
                <span>Total jobs</span>
                <span className="stat-icon">▤</span>
              </div>

              <strong>12</strong>

              <p>
                <span className="positive">+3</span>{" "}
                this week
              </p>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span>Active jobs</span>
                <span className="stat-icon">◷</span>
              </div>

              <strong>4</strong>

              <p>Currently in progress</p>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span>Pending confirmation</span>
                <span className="stat-icon">✓</span>
              </div>

              <strong>3</strong>

              <p>Awaiting customer action</p>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span>Completed</span>
                <span className="stat-icon">●</span>
              </div>

              <strong>5</strong>

              <p>Proof-of-work reports</p>
            </div>
          </section>

          <section className="content-grid">
            <div className="jobs-card">
              <div className="card-heading">
                <div>
                  <h2>Recent jobs</h2>
                  <p>
                    The latest service activity.
                  </p>
                </div>

                <button className="text-button">
                  View all
                </button>
              </div>

              <div className="jobs-table-wrapper">
                <table className="jobs-table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Customer</th>
                      <th>Service</th>
                      <th>Technician</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>

                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <strong>{job.id}</strong>
                        </td>

                        <td>{job.customer}</td>

                        <td>{job.service}</td>

                        <td>{job.technician}</td>

                        <td>
                          <span
                            className={`status-badge status-${job.status
                              .toLowerCase()
                              .replace(" ", "-")}`}
                          >
                            <span />
                            {job.status}
                          </span>
                        </td>

                        <td className="date-cell">
                          {job.date}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="activity-card">
              <div className="card-heading">
                <div>
                  <h2>Activity</h2>
                  <p>Latest updates.</p>
                </div>
              </div>

              <div className="activity-list">
                <div className="activity-item">
                  <div className="activity-dot" />

                  <div>
                    <strong>
                      Job JOB-1024 completed
                    </strong>
                    <span>
                      Evidence submitted by Amit Kumar
                    </span>
                    <small>12 minutes ago</small>
                  </div>
                </div>

                <div className="activity-item">
                  <div className="activity-dot" />

                  <div>
                    <strong>
                      Customer confirmation received
                    </strong>
                    <span>
                      JOB-1021 was confirmed
                    </span>
                    <small>1 hour ago</small>
                  </div>
                </div>

                <div className="activity-item">
                  <div className="activity-dot" />

                  <div>
                    <strong>
                      New job assigned
                    </strong>
                    <span>
                      JOB-1023 assigned to Rohit Singh
                    </span>
                    <small>2 hours ago</small>
                  </div>
                </div>
              </div>
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}
