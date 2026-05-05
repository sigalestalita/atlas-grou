import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';

export default function AdminIndex() {
  const { isSuperAdmin, isCompanyAdmin, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (isSuperAdmin) return <Navigate to="/admin/companies" replace />;
  if (isCompanyAdmin) return <Navigate to="/admin/dashboard" replace />;
  return (
    <div className="text-center py-20">
      <h1 className="text-2xl font-bold mb-2">Sem acesso</h1>
      <p className="text-muted-foreground">Sua conta não possui permissão de administrador. Entre em contato com o suporte.</p>
    </div>
  );
}
