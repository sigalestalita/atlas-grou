import { useEffect, useState } from 'react';
import { useParams, Outlet, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Building2, LayoutDashboard, FileText, Users, Link2, BarChart3 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Company {
  id: string;
  name: string;
  slug: string;
  primary_color: string;
  logo_url: string | null;
}

export default function CompanyView() {
  const { companyId } = useParams();
  const [company, setCompany] = useState<Company | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!companyId) return;
    supabase.from('companies').select('*').eq('id', companyId).single().then(({ data }) => {
      setCompany(data as Company | null);
    });
  }, [companyId]);

  if (!company) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const tabs = [
    { label: 'Dashboard', path: '', icon: LayoutDashboard },
    { label: 'Pesquisa', path: 'survey', icon: FileText },
    { label: 'Colaboradores', path: 'respondents', icon: Users },
    { label: 'Links', path: 'links', icon: Link2 },
    { label: 'Progresso', path: 'progress', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: company.primary_color }}>
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <p className="text-sm text-muted-foreground">/{company.slug}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap border-b pb-2">
        {tabs.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path === '' ? `/admin/company/${companyId}` : `/admin/company/${companyId}/${tab.path}`}
            end={tab.path === ''}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`
            }
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet context={{ company }} />
    </div>
  );
}
