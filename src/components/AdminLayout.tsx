import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import { Building2, FileText, Users, LayoutDashboard, LogOut, Settings, BarChart3, Link2, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';

const superAdminItems = [
  { title: 'Empresas', url: '/admin/companies', icon: Building2 },
  { title: 'Templates', url: '/admin/templates', icon: FileText },
];

const companyAdminItems = [
  { title: 'Dashboard', url: '/admin/dashboard', icon: LayoutDashboard },
  { title: 'Pesquisa', url: '/admin/survey', icon: FileText },
  { title: 'Colaboradores', url: '/admin/respondents', icon: Users },
  { title: 'Links', url: '/admin/links', icon: Link2 },
  { title: 'Progresso', url: '/admin/progress', icon: BarChart3 },
];

function AdminSidebar() {
  const { isSuperAdmin, isCompanyAdmin, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const items = isSuperAdmin ? superAdminItems : companyAdminItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="flex flex-col h-full">
        <div className="p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
            <BarChart3 className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && <span className="font-semibold text-sm text-sidebar-foreground">Clima Org</span>}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>{isSuperAdmin ? 'Administração' : 'Empresa'}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)}>
                    <NavLink to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Acesso Rápido</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith('/admin/users')}>
                    <NavLink to="/admin/users" className="flex items-center gap-2">
                      <UserCog className="h-4 w-4" />
                      {!collapsed && <span>Admins</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <div className="mt-auto p-4">
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70" onClick={() => { signOut(); navigate('/login'); }}>
            <LogOut className="h-4 w-4 mr-2" />
            {!collapsed && 'Sair'}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export default function AdminLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-4">
            <SidebarTrigger />
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
