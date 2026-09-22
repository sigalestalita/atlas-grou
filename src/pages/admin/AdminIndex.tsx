import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Loader2, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/PageHeader";

/** Manda cada perfil para a sua primeira tela. */
export default function AdminIndex() {
  const { isSuperAdmin, isCompanyAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (isSuperAdmin) return <Navigate to="/admin/companies" replace />;
  if (isCompanyAdmin) return <Navigate to="/admin/dashboard" replace />;

  return (
    <EmptyState
      icon={ShieldAlert}
      title="Sua conta ainda não tem acesso"
      description="Ela existe, mas não está ligada a nenhuma empresa nem tem permissão de administrador. Procure quem administra a plataforma para liberar."
    />
  );
}
