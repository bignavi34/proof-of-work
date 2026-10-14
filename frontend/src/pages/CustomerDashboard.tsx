import { Link } from "react-router-dom";
import AIWorkSearch from "../components/AIWorkSearch";
export default function CustomerDashboard() {
  return (
    <>
      <section className="welcome-section">
        <p className="eyebrow">Customer dashboard</p>

        <h1>Hello</h1>
     
        <p>
          Request a service and track your work.
        </p>
      </section>
      <AIWorkSearch audience="customer" />

      <section className="dashboard-grid">
        <Link
          className="dashboard-card"
          to="/customer/requests"
        >
          <h2>Request a service</h2>

          <p>
            Tell us what service you need and when
            you'd like it done.
          </p>

          <span className="action-link">
            Create request →
          </span>
        </Link>

        <Link
          className="dashboard-card"
          to="/customer/jobs"
        >
          <h2>My jobs</h2>

          <p>
            Track services that are currently in progress.
          </p>

          <span className="action-link">
            View jobs →
          </span>
        </Link>

        <Link
          className="dashboard-card"
          to="/customer/completed"
        >
          <h2>Completed work</h2>

          <p>
            View your completed service records and
            proof of work.
          </p>

          <span className="action-link">
            View records →
          </span>
        </Link>
      </section>
    </>
  );
}
