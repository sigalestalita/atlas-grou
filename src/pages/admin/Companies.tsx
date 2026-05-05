import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Building2, Pencil, Trash2, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  created_at: string;
}

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', primary_color: '#3B82F6', secondary_color: '#1E40AF' });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchCompanies = async () => {
    const { data } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
    setCompanies((data as Company[]) || []);
  };

  useEffect(() => { fetchCompanies(); }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Selecione um arquivo de imagem', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Imagem deve ter no máximo 2MB', variant: 'destructive' });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async (companyId: string): Promise<string | null> => {
    if (!logoFile) return existingLogoUrl;
    const ext = logoFile.name.split('.').pop() || 'png';
    const path = `${companyId}/logo.${ext}`;

    const { error } = await supabase.storage.from('company-logos').upload(path, logoFile, { upsert: true });
    if (error) {
      console.error('Upload error:', error);
      toast({ title: 'Erro ao enviar logo', description: error.message, variant: 'destructive' });
      return existingLogoUrl;
    }

    const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast({ title: 'Preencha nome e slug', variant: 'destructive' });
      return;
    }
    setUploading(true);
    const slug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

    try {
      if (editId) {
        const logoUrl = await uploadLogo(editId);
        const { error } = await supabase.from('companies').update({
          name: form.name.trim(), slug, primary_color: form.primary_color,
          secondary_color: form.secondary_color, logo_url: logoUrl,
        }).eq('id', editId);
        if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
        toast({ title: 'Empresa atualizada' });
      } else {
        const { data: inserted, error } = await supabase.from('companies').insert({
          name: form.name.trim(), slug, primary_color: form.primary_color,
          secondary_color: form.secondary_color,
        }).select().single();
        if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
        if (inserted && logoFile) {
          const logoUrl = await uploadLogo(inserted.id);
          if (logoUrl) {
            await supabase.from('companies').update({ logo_url: logoUrl }).eq('id', inserted.id);
          }
        }
        toast({ title: 'Empresa criada' });
      }
      resetForm();
      fetchCompanies();
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setOpen(false);
    setEditId(null);
    setForm({ name: '', slug: '', primary_color: '#3B82F6', secondary_color: '#1E40AF' });
    setLogoFile(null);
    setLogoPreview(null);
    setExistingLogoUrl(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta empresa?')) return;
    await supabase.from('companies').delete().eq('id', id);
    fetchCompanies();
    toast({ title: 'Empresa excluída' });
  };

  const openEdit = (c: Company) => {
    setEditId(c.id);
    setForm({ name: c.name, slug: c.slug, primary_color: c.primary_color, secondary_color: c.secondary_color });
    setExistingLogoUrl(c.logo_url);
    setLogoPreview(c.logo_url);
    setLogoFile(null);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Empresas</h1>
          <p className="text-muted-foreground">Gerencie as empresas da plataforma</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nova Empresa</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              {/* Logo Upload */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Logo</label>
                <div className="flex items-center gap-4">
                  {logoPreview ? (
                    <div className="relative w-16 h-16 rounded-xl border overflow-hidden bg-muted">
                      <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                      <button
                        type="button"
                        onClick={() => { setLogoFile(null); setLogoPreview(null); setExistingLogoUrl(null); }}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="w-16 h-16 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors bg-muted/50"
                    >
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Button variant="outline" size="sm" type="button" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="mr-2 h-3 w-3" />
                      {logoPreview ? 'Trocar' : 'Enviar logo'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou SVG. Máx. 2MB.</p>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Nome</label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Tectaris" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Slug (URL)</label>
                <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="tectaris" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Cor Primária</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} className="w-10 h-10 rounded cursor-pointer" />
                    <Input value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} className="flex-1" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Cor Secundária</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={form.secondary_color} onChange={e => setForm(f => ({ ...f, secondary_color: e.target.value }))} className="w-10 h-10 rounded cursor-pointer" />
                    <Input value={form.secondary_color} onChange={e => setForm(f => ({ ...f, secondary_color: e.target.value }))} className="flex-1" />
                  </div>
                </div>
              </div>
              <Button onClick={handleSave} className="w-full" disabled={uploading}>
                {uploading ? 'Salvando...' : editId ? 'Salvar Alterações' : 'Criar Empresa'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {companies.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma empresa cadastrada ainda.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {companies.map(c => (
            <Card key={c.id} className="group hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(`/admin/company/${c.id}`)}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  {c.logo_url ? (
                    <img src={c.logo_url} alt={c.name} className="w-10 h-10 rounded-xl object-contain bg-muted border" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.primary_color }}>
                      <Building2 className="h-5 w-5 text-white" />
                    </div>
                  )}
                  <CardTitle className="text-lg">{c.name}</CardTitle>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">/{c.slug}</p>
                <div className="flex gap-2 mt-2">
                  <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: c.primary_color }} />
                  <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: c.secondary_color }} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
