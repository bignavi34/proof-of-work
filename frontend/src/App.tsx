import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import CompletedWork from "./pages/CompletedWork";
import TechnicianJobDetail from "./technician/TechnicianJobDetail";
import CustomerJobs from "./pages/CustomerJobs";
import LoginPage from "./auth/LoginPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import AdminServiceRequests from "./pages/AdminServiceRequests";
import CustomerLayout from "./layouts/CustomerLayout";
import AdminLayout from "./layouts/AdminLayout";
import AdminJobs from "./pages/AdminJobs";
import DashboardRouter from "./pages/DashboardRouter";
import CustomerDashboard from "./pages/CustomerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import TechnicianJobs from "./pages/TechnicianJobs";
import ServiceRequests from "./pages/ServiceRequests";
import AdminTechnicians from "./pages/AdminTechnicians";
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={<LoginPage />}
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardRouter />
            </ProtectedRoute>
          }
        />

        {/* CUSTOMER PANEL */}
        <Route
          path="/customer"
          element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <CustomerLayout />
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={<CustomerDashboard />}
          />

          <Route
            path="requests"
            element={<ServiceRequests />}
          />
          <Route
            path="jobs"
            element={<CustomerJobs />}
          />
        
         <Route
            path="completed"
            element={<CompletedWork />}
          />
        </Route>
        {/* TECHNICIAN */}
        <Route
          path="/technician"
          element={
            <ProtectedRoute allowedRoles={["technician"]}>
              <TechnicianJobs />
            </ProtectedRoute>
          }
        />
        <Route
            path="/technician/jobs/:jobId"
            element={
           <ProtectedRoute allowedRoles={["technician"]}>
          <TechnicianJobDetail />
      </ProtectedRoute>
  }
/>
        {/* ADMIN PANEL */}
<Route
  path="/admin"
  element={
    <ProtectedRoute allowedRoles={["company_admin"]}>
      <AdminLayout />
    </ProtectedRoute>
  }
>
  <Route
    index
    element={<AdminDashboard />}
  />

  <Route
    path="requests"
    element={<AdminServiceRequests />}
  />

  <Route
    path="jobs"
    element={<AdminJobs />}
  />

  <Route
    path="technicians"
    element={<AdminTechnicians />}
  />

  <Route
    path="evidence"
    element={
      <div className="page-placeholder">
        <p className="eyebrow">Operations</p>
        <h1>Evidence</h1>
        <p>Review submitted proof of work.</p>
      </div>
    }
  />
</Route>
        <Route
          path="*"
          element={<Navigate to="/dashboard" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
