import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { RequireAuth, RequireSuperAdmin } from "@/components/RequireAuth";
import AdminLayout from "@/components/AdminLayout";
import Login from "@/pages/Login";
import SurveyPage from "@/pages/SurveyPage";
import Companies from "@/pages/admin/Companies";
import Templates from "@/pages/admin/Templates";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminIndex from "@/pages/admin/AdminIndex";
import CompanyView from "@/pages/admin/CompanyView";
import Dashboard from "@/pages/admin/Dashboard";
import SurveyConfig from "@/pages/admin/SurveyConfig";
import Respondents from "@/pages/admin/Respondents";
import Links from "@/pages/admin/Links";
import ProgressPage from "@/pages/admin/Progress";
import ExportPage from "@/pages/admin/Export";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />

            {/* Anonymous survey route (no auth needed) */}
            <Route path="/survey/:slug/:token" element={<SurveyPage />} />

            {/* Admin routes */}
            <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
              <Route index element={<AdminIndex />} />

              {/* Super Admin routes */}
              <Route path="companies" element={<RequireSuperAdmin><Companies /></RequireSuperAdmin>} />
              <Route path="templates" element={<RequireSuperAdmin><Templates /></RequireSuperAdmin>} />
              <Route path="users" element={<RequireSuperAdmin><AdminUsers /></RequireSuperAdmin>} />

              {/* Super Admin viewing a specific company */}
              <Route path="company/:companyId" element={<RequireSuperAdmin><CompanyView /></RequireSuperAdmin>}>
                <Route index element={<Dashboard />} />
                <Route path="survey" element={<SurveyConfig />} />
                <Route path="respondents" element={<Respondents />} />
                <Route path="links" element={<Links />} />
                <Route path="progress" element={<ProgressPage />} />
                <Route path="export" element={<ExportPage />} />
              </Route>

              {/* Company Admin routes */}
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="survey" element={<SurveyConfig />} />
              <Route path="respondents" element={<Respondents />} />
              <Route path="links" element={<Links />} />
              <Route path="progress" element={<ProgressPage />} />
              <Route path="export" element={<ExportPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
