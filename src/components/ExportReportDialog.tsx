import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { FileText, FileSpreadsheet, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReportSection {
  key: string;
  label: string;
  description: string;
  data: { headers: string[]; rows: (string | number)[][] };
}

interface ExportReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  surveyTitle: string;
  sections: ReportSection[];
  branding?: { primary: string; secondary: string; logoUrl?: string };
}

export default function ExportReportDialog({
  open, onOpenChange, companyName, surveyTitle, sections, branding,
}: ExportReportDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(sections.map(s => s.key)));
  const [exporting, setExporting] = useState(false);

  const toggle = (key: string) => {
    setSelected(prev => {
      const copy = new Set(prev);
      if (copy.has(key)) copy.delete(key); else copy.add(key);
      return copy;
    });
  };

  const selectAll = () => setSelected(new Set(sections.map(s => s.key)));
  const selectNone = () => setSelected(new Set());

  const selectedSections = sections.filter(s => selected.has(s.key));

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push(`Relatório: ${surveyTitle}`);
    lines.push(`Empresa: ${companyName}`);
    lines.push(`Data: ${new Date().toLocaleDateString('pt-BR')}`);
    lines.push('');

    for (const sec of selectedSections) {
      lines.push(`=== ${sec.label} ===`);
      lines.push(sec.headers.join(','));
      for (const row of sec.data.rows) {
        lines.push(row.map(c => {
          const s = String(c);
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(','));
      }
      lines.push('');
    }

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${companyName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const primary = branding?.primary || '#ff5700';
      const secondary = branding?.secondary || '#03104f';

      // Helper
      const hexToRgb = (hex: string): [number, number, number] => {
        const h = hex.replace('#', '');
        return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
      };

      const [pr, pg, pb] = hexToRgb(primary);
      const [sr, sg, sb] = hexToRgb(secondary);

      // --- COVER PAGE ---
      doc.setFillColor(sr, sg, sb);
      doc.rect(0, 0, pageW, pageH, 'F');

      doc.setFillColor(pr, pg, pb);
      doc.rect(0, pageH * 0.35, pageW, 4, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.setTextColor(255, 255, 255);
      doc.text('Relatório de', pageW / 2, pageH * 0.25, { align: 'center' });
      doc.text('Pesquisa de Clima', pageW / 2, pageH * 0.25 + 12, { align: 'center' });

      doc.setFontSize(18);
      doc.setTextColor(pr, pg, pb);
      doc.text(companyName, pageW / 2, pageH * 0.45, { align: 'center' });

      doc.setFontSize(12);
      doc.setTextColor(200, 200, 220);
      doc.text(surveyTitle, pageW / 2, pageH * 0.52, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(150, 150, 170);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`, pageW / 2, pageH * 0.58, { align: 'center' });

      doc.setFontSize(8);
      doc.setTextColor(100, 100, 130);
      doc.text('Confidencial — Uso exclusivo da empresa', pageW / 2, pageH * 0.92, { align: 'center' });

      // --- TABLE OF CONTENTS ---
      doc.addPage();
      let y = 25;

      // Page header helper
      const drawHeader = (title: string) => {
        doc.setFillColor(sr, sg, sb);
        doc.rect(0, 0, pageW, 18, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(title, 15, 12);
        doc.setFontSize(8);
        doc.setTextColor(200, 200, 220);
        doc.text(companyName, pageW - 15, 12, { align: 'right' });
      };

      drawHeader('Índice');
      y = 35;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(sr, sg, sb);
      doc.text('Conteúdo do Relatório', 15, y);
      y += 12;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);

      selectedSections.forEach((sec, i) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(pr, pg, pb);
        doc.text(`${i + 1}.`, 15, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        doc.text(sec.label, 25, y);
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(sec.description, 25, y + 5);
        doc.setFontSize(11);
        y += 14;
      });

      // --- DATA SECTIONS ---
      for (let si = 0; si < selectedSections.length; si++) {
        const sec = selectedSections[si];
        doc.addPage();
        drawHeader(`${si + 1}. ${sec.label}`);

        let startY = 28;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(sr, sg, sb);
        doc.text(sec.label, 15, startY);
        startY += 4;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(sec.description, 15, startY + 4);
        startY += 12;

        // Draw table
        autoTable(doc, {
          startY,
          head: [sec.data.headers],
          body: sec.data.rows.map(row => row.map(c => String(c))),
          styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
          headStyles: {
            fillColor: [sr, sg, sb],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
          },
          alternateRowStyles: { fillColor: [245, 245, 250] },
          margin: { left: 15, right: 15 },
          tableWidth: 'auto',
          didDrawPage: (data: any) => {
            // Footer
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text(
              `Página ${doc.getNumberOfPages()}`,
              pageW / 2,
              pageH - 8,
              { align: 'center' }
            );
          },
        });
      }

      // Footer on all pages
      const totalPages = doc.getNumberOfPages();
      for (let i = 2; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(180, 180, 180);
        doc.text('Confidencial', 15, pageH - 8);
        doc.text(`${i} / ${totalPages}`, pageW - 15, pageH - 8, { align: 'right' });
      }

      doc.save(`relatorio_${companyName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Exportar Relatório
          </DialogTitle>
          <DialogDescription>
            Selecione quais análises incluir no relatório para <strong>{companyName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Seções do Relatório</span>
            <div className="flex gap-2 text-xs">
              <button onClick={selectAll} className="text-primary hover:underline">Marcar todos</button>
              <span className="text-muted-foreground">|</span>
              <button onClick={selectNone} className="text-muted-foreground hover:underline">Desmarcar</button>
            </div>
          </div>
          <Separator />
          <div className="space-y-3 py-2">
            {sections.map(sec => (
              <div key={sec.key} className="flex items-start gap-3">
                <Checkbox
                  id={sec.key}
                  checked={selected.has(sec.key)}
                  onCheckedChange={() => toggle(sec.key)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label htmlFor={sec.key} className="text-sm font-medium cursor-pointer">{sec.label}</Label>
                  <p className="text-xs text-muted-foreground">{sec.description}</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">{sec.data.rows.length} registros</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={exportCSV}
            disabled={selected.size === 0}
            className="flex items-center gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button
            onClick={exportPDF}
            disabled={selected.size === 0 || exporting}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            {exporting ? 'Gerando PDF...' : 'Exportar PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
