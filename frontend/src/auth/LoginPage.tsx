import { useMemo } from "react";

import { API_URL } from "../api/config";
export default function LoginPage() {
const error = useMemo(() => {
  const params = new URLSearchParams(window.location.search);

  if (params.get("error") === "admin_access_required") {
    return "This Google account does not have administrator access.";
  }

  if (params.get("error") === "technician_access_required") {
    return "This Google account does not have technician access.";
  }

  if (params.get("error") === "admin_use_admin_login") {
    return "This account is an administrator. Please use Admin Login.";
  }

  if (params.get("error") === "technician_use_technician_login") {
    return "This account is a technician. Please use Technician Login.";
  }

  return "";
}, []);


  function loginAsUser() {
    window.location.href = `${API_URL}/auth/google/login`;
  }

  function loginAsTechnician() {
    window.location.href = `${API_URL}/auth/google/technician-login`;
  }

  function loginAsAdmin() {
    window.location.href = `${API_URL}/auth/google/admin-login`;
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div className="login-brand-mark">PW</div>

          <div>
            <h1>Proof of Work</h1>
            <p>Verified service work, backed by evidence.</p>
          </div>
        </div>

        <div className="login-content">
          <p className="eyebrow">Welcome</p>

          <h2>Sign in to continue</h2>

          <p className="login-description">
            Access your service requests, jobs, and verified work records.
          </p>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="button"
            className="login-button-primary"
            onClick={loginAsUser}
          >
            Continue as User
          </button>

          <button
            type="button"
            className="login-button-admin"
            onClick={loginAsTechnician}
          >
            Technician Login
          </button>

          <button
            type="button"
            className="login-button-admin"
            onClick={loginAsAdmin}
          >
            Admin Login
          </button>
        </div>
      </section>
    </main>
  );
}
