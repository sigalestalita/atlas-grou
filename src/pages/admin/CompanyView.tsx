import { useEffect, useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, Building2, Download, ExternalLink, FileText, KeyRound,
  LayoutDashboard, Link2, MessageSquare, UserCheck, Users, UsersRound,
} from "lucide-react";
import { EmptyState } from "@/components/PageHeader";

interface Company {
  id: string;
  name: string;
  slug: string;
  primary_color: string;
  logo_url: string | null;
}

const TABS = [
  { label: "Dashboard", path: "", icon: LayoutDashboard },
  { label: "Pesquisa", path: "survey", icon: FileText },
  { label: "Colaboradores", path: "respondents", icon: Users },
  { label: "Avaliações", path: "evaluations", icon: UserCheck },
  { label: "360", path: "360", icon: UsersRound },
  { label: "Links", path: "links", icon: Link2 },
  { label: "Acompanhamento", path: "tracking", icon: Activity },
  { label: "Respostas", path: "responses", icon: MessageSquare },
  { label: "Exportar", path: "export", icon: Download },
  { label: "Acesso ao relatório", path: "report-access", icon: KeyRound },
];

/** Casca de uma empresa vista pelo super admin. */
export default function CompanyView() {
  const { companyId } = useParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    supabase.from("companies").select("*").eq("id", companyId).single().then(({ data }) => {
      setCompany((data as Company) ?? null);
      setLoading(false);
    });
  }, [companyId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-72 rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-80 rounded-[22px]" />
      </div>
    );
  }

  if (!company) {
    return <EmptyState icon={Building2} title="Empresa não encontrada" description="Ela pode ter sido excluída." />;
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        {company.logo_url ? (
          <img src={company.logo_url} alt="" className="h-11 w-11 rounded-xl border border-border bg-muted object-contain" />
        ) : (
          <div className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{ backgroundColor: company.primary_color }}>
            <Building2 className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-semibold tracking-tight md:text-[26px]">{company.name}</h1>
          <p className="text-[12.5px] text-muted-foreground">/{company.slug}</p>
        </div>
      </div>

      {/* Barra de abas: rola na horizontal no celular em vez de quebrar em três linhas. */}
      <nav className="-mx-4 mb-6 overflow-x-auto border-b border-border px-4 pb-2 md:-mx-8 md:px-8">
        <div className="flex w-max gap-1.5">
          {TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path === "" ? `/admin/company/${companyId}` : `/admin/company/${companyId}/${tab.path}`}
              end={tab.path === ""}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                }`
              }
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </NavLink>
          ))}
          <a
            href={`/relatorio/${company.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            <ExternalLink className="h-4 w-4" />
            Relatório público
          </a>
        </div>
      </nav>

      <Outlet context={{ company }} />
    </div>
  );
}
