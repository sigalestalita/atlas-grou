import { useMemo } from "react";
import { Outlet, useLocation, useNavigate, NavLink } from "react-router-dom";
import {
  Building2, FileText, Users, LayoutDashboard, LogOut, BarChart3,
  Link2, UserCog, MessageSquare, Activity, Download, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AtlasMark } from "@/components/AtlasMark";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Menu do super admin — quem opera a plataforma inteira.
 * Agrupado por intenção: primeiro a carteira de clientes, depois o que é
 * comum a todas elas.
 */
const SUPER_ADMIN_GROUPS: NavGroup[] = [
  {
    label: "Clientes",
    items: [
      { title: "Empresas", url: "/admin/companies", icon: Building2 },
      { title: "Analítico da rede", url: "/admin/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Plataforma",
    items: [
      { title: "Templates", url: "/admin/templates", icon: FileText },
      { title: "Administradores", url: "/admin/users", icon: UserCog },
    ],
  },
];

/**
 * Menu do admin de empresa. A ordem acompanha o ciclo da pesquisa:
 * montar → distribuir → acompanhar → ler o resultado.
 */
const COMPANY_ADMIN_GROUPS: NavGroup[] = [
  {
    label: "Resultado",
    items: [
      { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
      { title: "Respostas", url: "/admin/responses", icon: MessageSquare },
      { title: "Exportar", url: "/admin/export", icon: Download },
    ],
  },
  {
    label: "Pesquisa",
    items: [
      { title: "Configuração", url: "/admin/survey", icon: FileText },
      { title: "Colaboradores", url: "/admin/respondents", icon: Users },
      { title: "Links", url: "/admin/links", icon: Link2 },
    ],
  },
  {
    label: "Campo",
    items: [
      { title: "Progresso", url: "/admin/progress", icon: BarChart3 },
      { title: "Acompanhamento", url: "/admin/tracking", icon: Activity },
    ],
  },
];

const MENU_BUTTON_CLASS =
  "h-10 px-3 text-[13.5px] font-medium text-sidebar-foreground/75 " +
  "hover:bg-white/[.06] hover:text-sidebar-foreground " +
  "data-[active=true]:bg-white/[.12] data-[active=true]:text-sidebar-foreground data-[active=true]:font-semibold " +
  "data-[active=true]:shadow-[inset_0_1px_0_rgba(255,255,255,.08)] " +
  "group-data-[collapsible=icon]:!h-10 group-data-[collapsible=icon]:!w-10 group-data-[collapsible=icon]:justify-center " +
  "[&>svg]:size-[19px] [&>svg]:opacity-75 data-[active=true]:[&>svg]:opacity-100";

const GROUP_LABEL_CLASS =
  "px-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45";

function AdminSidebar() {
  const { isSuperAdmin, signOut, user } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const groups = isSuperAdmin ? SUPER_ADMIN_GROUPS : COMPANY_ADMIN_GROUPS;

  const isActive = (item: NavItem) =>
    item.end ? pathname === item.url : pathname.startsWith(item.url);

  const email = user?.email ?? "";
  const initials = useMemo(() => {
    const name = email.split("@")[0] ?? "";
    const parts = name.split(/[.\-_]/).filter(Boolean).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase()).join("") || "A";
  }, [email]);

  return (
    <Sidebar collapsible="icon" variant="floating" className="border-0">
      <SidebarHeader className="px-3 pb-1 pt-3">
        <div className="flex w-full items-center gap-2.5 rounded-2xl p-1.5 text-left group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[.08] text-white ring-1 ring-white/10">
            <AtlasMark className="h-[19px] w-[19px]" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[14.5px] font-semibold text-sidebar-foreground">Atlas</div>
              <div className="truncate text-[11px] text-sidebar-foreground/55">
                {isSuperAdmin ? "Administração da plataforma" : "Pesquisa de clima"}
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-2 pt-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className={GROUP_LABEL_CLASS}>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item)}
                      tooltip={item.title}
                      className={MENU_BUTTON_CLASS}
                    >
                      <NavLink to={item.url} end={item.end}>
                        <item.icon strokeWidth={1.75} />
                        {!collapsed && <span className="flex-1 truncate">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-3 pb-3 pt-2">
        <div className="flex items-center gap-2.5 rounded-2xl bg-white/[.06] p-2 ring-1 ring-white/[.06] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:ring-0">
          <Avatar className="h-9 w-9 shrink-0 rounded-full">
            <AvatarFallback className="rounded-full bg-gradient-to-br from-sidebar-primary to-sidebar-accent text-[11.5px] font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[13px] font-semibold text-sidebar-foreground">
                  {email.split("@")[0] || "Administrador"}
                </span>
                <span className="truncate text-[11px] text-sidebar-foreground/55">
                  {isSuperAdmin ? "Super admin" : "Admin da empresa"}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => { await signOut(); navigate("/login"); }}
                title="Sair"
                aria-label="Sair"
                className="rounded-xl p-2 text-sidebar-foreground/55 transition-colors hover:bg-white/[.08] hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Casca do admin: menu navy à esquerda, barra clara no topo, conteúdo sobre o cinza frio. */
export default function AdminLayout() {
  const { isSuperAdmin } = useAuth();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between px-4 pt-1 md:px-8">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="rounded-xl text-muted-foreground hover:bg-card hover:text-foreground" />
            </div>
            <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-secondary-foreground">
              {isSuperAdmin ? "Super admin" : "Admin"}
            </span>
          </header>
          <main className="flex-1 overflow-auto px-4 pb-8 pt-2 md:px-8 md:pt-3">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
