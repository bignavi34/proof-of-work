
import { useMemo, useState, type FormEvent } from "react";
import { API_URL } from "../api/config";

type LoginMode = "user" | "technician" | "admin";
type AuthView = "signin" | "signup";

export default function LoginPage() {
  const [view, setView] = useState<AuthView>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMode, setLoginMode] = useState<LoginMode>("user");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const oauthError = useMemo(() => {
    const params = new URLSearchParams(window.location.search);

    const errors: Record<string, string> = {
      admin_access_required:
        "This Google account does not have administrator access.",
      technician_access_required:
        "This Google account does not have technician access.",
      admin_use_admin_login:
        "This account is an administrator. Please use Admin Login.",
      technician_use_technician_login:
        "This account is a technician. Please use Technician Login.",
    };

    return errors[params.get("error") ?? ""] ?? "";
  }, []);

  function switchView(nextView: AuthView) {
    setView(nextView);
    setFormError("");
    setSuccessMessage("");
  }

  function loginAsUser() {
    window.location.href = `${API_URL}/auth/google/login`;
  }

  function loginAsTechnician() {
    window.location.href = `${API_URL}/auth/google/technician-login`;
  }

  function loginAsAdmin() {
    window.location.href = `${API_URL}/auth/google/admin-login`;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const isSignup = view === "signup";

      if (isSignup && loginMode !== "user") {
        throw new Error(
          "Public signup is available for customers only."
        );
      }

      const endpoint = isSignup
        ? "/auth/signup"
        : "/auth/password/login";

      const body = isSignup
        ? {
            name: name.trim(),
            email: email.trim(),
            password,
          }
        : {
            email: email.trim(),
            password,
            login_mode: loginMode,
          };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Invalid email or password.");
        }

        if (response.status === 409) {
          throw new Error(
            typeof data?.detail === "string"
              ? data.detail
              : "An account with this email already exists. Please sign in."
          );
        }

        if (response.status === 403) {
          throw new Error(
            typeof data?.detail === "string"
              ? data.detail
              : "You are not authorized to use this login."
          );
        }

        if (response.status === 422) {
          throw new Error(
            "Please check your name, email, and password requirements."
          );
        }

        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "The request failed. Please try again."
        );
      }

      if (isSignup) {
        setPassword("");
        setView("signin");
        setLoginMode("user");
        setFormError("");
        setSuccessMessage(
          "Account created successfully. You can now sign in."
        );
        return;
      }

      const destinations: Record<LoginMode, string> = {
        user: "/customer",
        technician: "/technician",
        admin: "/admin",
      };

      const destination =
        typeof data?.redirect_to === "string" &&
        Object.values(destinations).includes(data.redirect_to)
          ? data.redirect_to
          : destinations[loginMode];

      window.location.assign(destination);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to complete your request. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <header className="login-brand">
          <div className="login-brand-mark" aria-hidden="true">
            PW
          </div>

          <div>
            <h1>Proof of Work</h1>
            <p>Verified service work, backed by evidence.</p>
          </div>
        </header>

        <div className="login-content">
          <p className="eyebrow">Welcome</p>

          <h2>
            {view === "signup"
              ? "Create your account"
              : "Sign in to continue"}
          </h2>

          <p className="login-description">
            Access your service requests, jobs, and verified work records.
          </p>

          {(oauthError || formError) && (
            <div className="login-error" role="alert">
              {formError || oauthError}
            </div>
          )}

          {successMessage && (
            <div role="status" aria-live="polite">
              {successMessage}
            </div>
          )}

          <div className="auth-view-switch" aria-label="Account options">
            <button
              type="button"
              aria-pressed={view === "signin"}
              disabled={loading}
              onClick={() => switchView("signin")}
            >
              Sign in
            </button>

            <button
              type="button"
              aria-pressed={view === "signup"}
              disabled={loading}
              onClick={() => switchView("signup")}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {view === "signup" && (
              <div>
                <label htmlFor="signup-name">Full name</label>
                <input
                  id="signup-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your full name"
                  maxLength={255}
                  required
                  disabled={loading}
                />
              </div>
            )}

            {view === "signin" && (
              <div>
                <label htmlFor="login-mode">Sign in as</label>
                <select
                  id="login-mode"
                  value={loginMode}
                  onChange={(event) =>
                    setLoginMode(event.target.value as LoginMode)
                  }
                  disabled={loading}
                  required
                >
                  <option value="user">Customer</option>
                  <option value="technician">Technician</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            )}

            <div>
              <label htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete={
                  view === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  view === "signup"
                    ? "At least 8 characters"
                    : "Enter your password"
                }
                minLength={view === "signup" ? 8 : undefined}
                maxLength={128}
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="login-button-primary"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : view === "signup"
                  ? "Create customer account"
                  : "Sign in with Email"}
            </button>
          </form>

          <div className="login-divider">
            <span>
              {view === "signup"
                ? "or sign up with Google"
                : "or continue with Google"}
            </span>
          </div>

          <div className="google-login-actions">
            <button
              type="button"
              className="login-button-primary google-login-button"
              onClick={loginAsUser}
              disabled={loading}
            >
              <span className="google-g-icon" aria-hidden="true">
                G
              </span>
              <span>Continue as Customer</span>
            </button>

            <button
              type="button"
              className="login-button-admin google-login-button"
              onClick={loginAsTechnician}
              disabled={loading}
            >
              <span className="google-g-icon" aria-hidden="true">
                G
              </span>
              <span>Continue as Technician</span>
            </button>

            <button
              type="button"
              className="login-button-admin google-login-button"
              onClick={loginAsAdmin}
              disabled={loading}
            >
              <span className="google-g-icon" aria-hidden="true">
                G
              </span>
              <span>Continue as Administrator</span>
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

