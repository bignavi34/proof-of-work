import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { getCurrentUser } from "../api/auth";
import type { User } from "../api/auth";

export default function DashboardRouter() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        console.error("Failed to load user:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  if (loading) {
    return (
      <main className="loading-page">
        <p>Loading your workspace...</p>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === "company_admin") {
    return <Navigate to="/admin" replace />;
  }

  if (user.role === "technician") {
    return <Navigate to="/technician" replace />;
  }

  if (user.role === "customer") {
    return <Navigate to="/customer" replace />;
  }

  return <Navigate to="/login" replace />;
}
