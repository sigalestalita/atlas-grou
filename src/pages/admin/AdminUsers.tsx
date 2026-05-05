import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, UserCog } from 'lucide-react';

export default function AdminUsers() {
  const [roles, setRoles] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', role: 'company_admin', company_id: '' });
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase.from('user_roles').select('*');
    setRoles(data || []);
    const { data: comps } = await supabase.from('companies').select('id, name');
    setCompanies(comps || []);
  };

  useEffect(() => { load(); }, []);

  const createAdmin = async () => {
    if (!form.email.trim() || !form.password.trim()) {
      toast({ title: 'Preencha email e senha', variant: 'destructive' });
      return;
    }
    if (form.role === 'company_admin' && !form.company_id) {
      toast({ title: 'Selecione uma empresa', variant: 'destructive' });
      return;
    }

    // Create auth user via supabase admin (this would normally be an edge function)
    // For now, we use signUp
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
    });

    if (authError || !authData.user) {
      toast({ title: 'Erro ao criar usuário', description: authError?.message, variant: 'destructive' });
      return;
    }

    const { error: roleError } = await supabase.from('user_roles').insert({
      user_id: authData.user.id,
      role: form.role as any,
      company_id: form.role === 'company_admin' ? form.company_id : null,
    });

    if (roleError) {
      toast({ title: 'Erro ao atribuir role', description: roleError.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Admin criado com sucesso' });
    setOpen(false);
    setForm({ email: '', password: '', role: 'company_admin', company_id: '' });
    load();
  };

  const deleteRole = async (id: string) => {
    if (!confirm('Remover esta permissão?')) return;
    await supabase.from('user_roles').delete().eq('id', id);
    load();
    toast({ title: 'Permissão removida' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Administradores</h1>
          <p className="text-muted-foreground">Gerencie os acessos da plataforma</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo Admin</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Administrador</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1"><label className="text-sm font-medium">Email</label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Senha</label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Tipo</label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin (Grou)</SelectItem>
                    <SelectItem value="company_admin">Admin Empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.role === 'company_admin' && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Empresa</label>
                  <Select value={form.company_id} onValueChange={v => setForm(f => ({ ...f, company_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <Button onClick={createAdmin} className="w-full">Criar Admin</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.user_id?.substring(0, 8)}...</TableCell>
                  <TableCell><Badge variant={r.role === 'super_admin' ? 'default' : 'secondary'}>{r.role === 'super_admin' ? 'Super Admin' : 'Admin Empresa'}</Badge></TableCell>
                  <TableCell>{companies.find(c => c.id === r.company_id)?.name || '-'}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => deleteRole(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
              {roles.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum admin cadastrado</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
