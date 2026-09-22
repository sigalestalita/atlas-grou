import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, ChevronRight, Pencil, Plus, Trash2, Upload, Users, X } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { scoreColor } from "@/lib/climate";

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  created_at: string;
}

/** Números por empresa, para o cartão dizer algo além do nome. */
interface CompanyStat {
  surveyTitle: string | null;
  surveyStatus: string | null;
  invited: number;
  responded: number;
}

const BLANK = { name: "", slug: "", primary_color: "#15498D", secondary_color: "#071A34" };

/** Gera o slug a partir do nome, sem acento e sem caractere solto. */
function slugify(text: string): string {
  return text
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<Record<string, CompanyStat>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Company | null>(null);
  const [form, setForm] = useState(BLANK);
  /** Fica falso assim que a pessoa mexe no slug — aí paramos de sugerir. */
  const [slugAuto, setSlugAuto] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [existingLogo, setExistingLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchAll = async () => {
    const { data } = await supabase.from("companies").select("*").order("created_at", { ascending: false });
    const list = (data as Company[]) || [];
    setCompanies(list);
    setLoading(false);
    if (!list.length) return;

    // Uma pesquisa e uma contagem por empresa, em duas consultas no total.
    const ids = list.map((c) => c.id);
    const [{ data: surveys }, { data: respondents }] = await Promise.all([
      supabase.from("surveys").select("id, company_id, title, status, created_at")
        .in("company_id", ids).neq("status", "draft").order("created_at", { ascending: false }),
      supabase.from("respondents").select("company_id, status").in("company_id", ids),
    ]);

    const byCompany: Record<string, CompanyStat> = {};
    for (const c of list) byCompany[c.id] = { surveyTitle: null, surveyStatus: null, invited: 0, responded: 0 };
    for (const s of surveys || []) {
      const cur = byCompany[s.company_id!];
      if (cur && !cur.surveyTitle) { cur.surveyTitle = s.title; cur.surveyStatus = s.status; }
    }
    for (const r of respondents || []) {
      const cur = byCompany[r.company_id];
      if (!cur) continue;
      cur.invited++;
      if (r.status === "responded") cur.responded++;
    }
    setStats(byCompany);
  };

  useEffect(() => { fetchAll(); }, []);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Escolha um arquivo de imagem", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "A imagem precisa ter no máximo 2 MB", variant: "destructive" });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async (companyId: string): Promise<string | null> => {
    if (!logoFile) return existingLogo;
    const ext = logoFile.name.split(".").pop() || "png";
    const path = `${companyId}/logo.${ext}`;
    const { error } = await supabase.storage.from("company-logos").upload(path, logoFile, { upsert: true });
    if (error) {
      toast({ title: "Não foi possível enviar o logo", description: error.message, variant: "destructive" });
      return existingLogo;
    }
    // O parâmetro de versão força o navegador a buscar o arquivo novo em vez
    // de servir o antigo do cache, já que o caminho não muda.
    const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  };

  const reset = () => {
    setOpen(false); setEditId(null); setForm(BLANK); setSlugAuto(true);
    setLogoFile(null); setLogoPreview(null); setExistingLogo(null);
  };

  const save = async () => {
    const name = form.name.trim();
    const slug = slugify(form.slug || name);
    if (!name || !slug) {
      toast({ title: "Preencha o nome da empresa", variant: "destructive" });
      return;
    }
    // O slug vira a URL da pesquisa; duas empresas com o mesmo derrubariam uma.
    const clash = companies.find((c) => c.slug === slug && c.id !== editId);
    if (clash) {
      toast({ title: "Esse endereço já está em uso", description: `A empresa "${clash.name}" já usa /${slug}.`, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        const logo_url = await uploadLogo(editId);
        const { error } = await supabase.from("companies").update({
          name, slug, primary_color: form.primary_color, secondary_color: form.secondary_color, logo_url,
        }).eq("id", editId);
        if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
        toast({ title: "Empresa atualizada" });
      } else {
        const { data: created, error } = await supabase.from("companies").insert({
          name, slug, primary_color: form.primary_color, secondary_color: form.secondary_color,
        }).select().single();
        if (error || !created) { toast({ title: "Erro ao criar", description: error?.message, variant: "destructive" }); return; }
        if (logoFile) {
          const logo_url = await uploadLogo(created.id);
          if (logo_url) await supabase.from("companies").update({ logo_url }).eq("id", created.id);
        }
        toast({ title: "Empresa criada" });
      }
      reset();
      fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("companies").delete().eq("id", toDelete.id);
    setToDelete(null);
    if (error) { toast({ title: "Não foi possível excluir", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Empresa excluída" });
    fetchAll();
  };

  const openEdit = (c: Company) => {
    setEditId(c.id);
    setForm({ name: c.name, slug: c.slug, primary_color: c.primary_color, secondary_color: c.secondary_color });
    setSlugAuto(false);
    setExistingLogo(c.logo_url);
    setLogoPreview(c.logo_url);
    setLogoFile(null);
    setOpen(true);
  };

  const dialog = (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : reset())}>
      <DialogTrigger asChild>
        <Button className="h-9 rounded-xl"><Plus className="mr-2 h-4 w-4" />Nova empresa</Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>{editId ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          <DialogDescription>
            O logo e as cores aparecem na pesquisa que o colaborador responde e no relatório público.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="flex items-center gap-4">
            {logoPreview ? (
              <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-border bg-muted">
                <img src={logoPreview} alt="" className="h-full w-full object-contain" />
                <button
                  type="button"
                  onClick={() => { setLogoFile(null); setLogoPreview(null); setExistingLogo(null); }}
                  aria-label="Remover logo"
                  className="absolute right-1 top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="grid h-16 w-16 place-items-center rounded-2xl border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-primary/50"
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
            <div>
              <Button variant="outline" size="sm" type="button" className="rounded-xl" onClick={() => fileInput.current?.click()}>
                <Upload className="mr-2 h-3.5 w-3.5" />{logoPreview ? "Trocar logo" : "Enviar logo"}
              </Button>
              <p className="mt-1 text-[11.5px] text-muted-foreground">PNG, JPG ou SVG · até 2 MB</p>
            </div>
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={pickFile} />
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium">Nome</label>
            <Input
              className="h-10 rounded-xl"
              value={form.name}
              placeholder="Tectaris"
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name, slug: slugAuto ? slugify(name) : f.slug }));
              }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium">Endereço da pesquisa</label>
            <div className="flex items-center gap-1.5 rounded-xl border border-input bg-background px-3">
              <span className="shrink-0 text-[13px] text-muted-foreground">/survey/</span>
              <Input
                className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
                value={form.slug}
                placeholder="tectaris"
                onChange={(e) => { setSlugAuto(false); setForm((f) => ({ ...f, slug: e.target.value })); }}
                onBlur={() => setForm((f) => ({ ...f, slug: slugify(f.slug) }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ColorField
              label="Cor principal" hint="Botões e destaques"
              value={form.primary_color}
              onChange={(v) => setForm((f) => ({ ...f, primary_color: v }))}
            />
            <ColorField
              label="Cor de apoio" hint="Fundos e gradientes"
              value={form.secondary_color}
              onChange={(v) => setForm((f) => ({ ...f, secondary_color: v }))}
            />
          </div>

          <Button className="h-10 w-full rounded-xl" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : editId ? "Salvar alterações" : "Criar empresa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-[22px]" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Empresas"
        description="Cada empresa tem a própria pesquisa, os próprios dados e a própria identidade."
        actions={dialog}
      />

      {companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nenhuma empresa cadastrada"
          description="Cadastre a primeira para montar a pesquisa dela."
          action={dialog}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 animate-stagger">
          {companies.map((c) => {
            const st = stats[c.id];
            const rate = st?.invited ? Math.round((st.responded / st.invited) * 100) : null;
            return (
              <Card
                key={c.id}
                className="group cursor-pointer rounded-[22px] card-hover-glow"
                onClick={() => navigate(`/admin/company/${c.id}`)}
              >
                <CardContent className="pt-5">
                  <div className="flex items-start gap-3">
                    {c.logo_url ? (
                      <img src={c.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-xl border border-border bg-muted object-contain" />
                    ) : (
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundColor: c.primary_color }}>
                        <Building2 className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{c.name}</p>
                      <p className="truncate text-[12px] text-muted-foreground">/{c.slug}</p>
                    </div>
                    <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(c)} aria-label="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setToDelete(c)} aria-label="Excluir">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-border pt-3.5">
                    {st?.surveyTitle ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[12.5px] text-muted-foreground">{st.surveyTitle}</span>
                          <Badge
                            className={`shrink-0 rounded-full border-0 text-[10px] ${
                              st.surveyStatus === "active"
                                ? "bg-[hsl(var(--success))] text-white"
                                : "bg-secondary text-secondary-foreground"
                            }`}
                          >
                            {st.surveyStatus === "active" ? "no ar" : "encerrada"}
                          </Badge>
                        </div>
                        {rate !== null ? (
                          <div className="mt-2.5">
                            <div className="mb-1 flex items-baseline justify-between">
                              <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                                <Users className="h-3 w-3" />{st.responded} de {st.invited}
                              </span>
                              <span className="text-[13px] font-bold tabular-nums" style={{ color: scoreColor(rate) }}>
                                {rate}%
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${rate}%`, backgroundColor: scoreColor(rate) }} />
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-[11.5px] text-muted-foreground">Link aberto, sem lista de convidados</p>
                        )}
                      </>
                    ) : (
                      <p className="text-[12.5px] text-muted-foreground">Nenhuma pesquisa no ar ainda</p>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-1 text-[12px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Abrir <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Some tudo: a pesquisa, os colaboradores cadastrados e todas as respostas já
              recebidas. Não tem como desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={remove}
            >
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ColorField({
  label, hint, value, onChange,
}: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium">{label}</label>
      <div className="flex items-center gap-2 rounded-xl border border-input bg-background p-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent text-[13px] uppercase tabular-nums outline-none"
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
