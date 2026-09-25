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
import { SurveyErrorBoundary } from "@/components/SurveyErrorBoundary";
import Setup from "@/pages/Setup";
import Companies from "@/pages/admin/Companies";
import Templates from "@/pages/admin/Templates";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminIndex from "@/pages/admin/AdminIndex";
import CompanyView from "@/pages/admin/CompanyView";
import Dashboard from "@/pages/admin/Dashboard";
import SurveyConfig from "@/pages/admin/SurveyConfig";
import Respondents from "@/pages/admin/Respondents";
import Links from "@/pages/admin/Links";
import Responses from "@/pages/admin/Responses";
import Tracking from "@/pages/admin/Tracking";
import ExportPage from "@/pages/admin/Export";
import Feedback360 from "@/pages/admin/Feedback360";
import EvaluationMatrix from "@/pages/admin/EvaluationMatrix";
import PlatformAnalytics from "@/pages/admin/PlatformAnalytics";
import ReportAccess from "@/pages/admin/ReportAccess";
import PublicReport from "@/pages/PublicReport";

import NotFound from "./pages/NotFound";
import { useParams } from "react-router-dom";

function ResultSlugGate() {
  const { resultSlug } = useParams();
  if (resultSlug && resultSlug.startsWith("result-")) return <PublicReport />;
  return <NotFound />;
}

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

            {/* Setup route (bootstrap first admin) */}
            <Route path="/setup" element={<Setup />} />

            {/* Anonymous survey routes (no auth needed) */}
            <Route path="/survey/:slug/:token" element={<SurveyErrorBoundary><SurveyPage /></SurveyErrorBoundary>} />
            <Route path="/survey/:slug" element={<SurveyErrorBoundary><SurveyPage /></SurveyErrorBoundary>} />

            {/* Public shareable report */}
            <Route path="/relatorio/:slug" element={<PublicReport />} />
            <Route path="/:resultSlug" element={<ResultSlugGate />} />

            {/* Admin routes */}
            <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
              <Route index element={<AdminIndex />} />

              {/* Super Admin routes */}
              <Route path="companies" element={<RequireSuperAdmin><Companies /></RequireSuperAdmin>} />
              <Route path="analytics" element={<RequireSuperAdmin><PlatformAnalytics /></RequireSuperAdmin>} />
              <Route path="templates" element={<RequireSuperAdmin><Templates /></RequireSuperAdmin>} />
              <Route path="users" element={<RequireSuperAdmin><AdminUsers /></RequireSuperAdmin>} />

              {/* Super Admin viewing a specific company */}
              <Route path="company/:companyId" element={<RequireSuperAdmin><CompanyView /></RequireSuperAdmin>}>
                <Route index element={<Dashboard />} />
                <Route path="survey" element={<SurveyConfig />} />
                <Route path="respondents" element={<Respondents />} />
                <Route path="360" element={<Feedback360 />} />
                <Route path="evaluations" element={<EvaluationMatrix />} />
                <Route path="links" element={<Links />} />
                <Route path="progress" element={<Navigate to="../tracking" replace />} />
                <Route path="tracking" element={<Tracking />} />
                <Route path="responses" element={<Responses />} />
                <Route path="export" element={<ExportPage />} />
                <Route path="report-access" element={<ReportAccess />} />
              </Route>


              {/* Company Admin routes */}
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="survey" element={<SurveyConfig />} />
              <Route path="respondents" element={<Respondents />} />
              <Route path="links" element={<Links />} />
              <Route path="progress" element={<Navigate to="/admin/tracking" replace />} />
              <Route path="tracking" element={<Tracking />} />
              <Route path="responses" element={<Responses />} />
              <Route path="360" element={<Feedback360 />} />
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
