import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { FileText, FileSpreadsheet, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title);

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

// Render Chart.js config to PNG data URL
async function renderChartDataUrl(config: any, width = 1100, height = 500): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.position = 'fixed';
  canvas.style.left = '-99999px';
  document.body.appendChild(canvas);
  const chart = new Chart(canvas, {
    ...config,
    options: { ...(config.options || {}), animation: false, responsive: false, devicePixelRatio: 2 },
  });
  chart.update('none');
  const dataUrl = canvas.toDataURL('image/png');
  chart.destroy();
  canvas.remove();
  return dataUrl;
}

// Fetch an image URL and return as data URL + dims
async function loadImageDataUrl(url: string): Promise<{ dataUrl: string; width: number; height: number; format: string } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const format = blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'JPEG' : 'PNG';
    return { dataUrl, width: img.naturalWidth, height: img.naturalHeight, format };
  } catch {
    return null;
  }
}

const parseNumeric = (v: string | number): number | null => {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v == null) return null;
  const cleaned = String(v).replace(/[^\d.,\-]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

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
      lines.push(sec.data.headers.join(','));
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

      const hexToRgb = (hex: string): [number, number, number] => {
        const h = hex.replace('#', '');
        return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
      };
      const [pr, pg, pb] = hexToRgb(primary);
      const [sr, sg, sb] = hexToRgb(secondary);

      // Preload logo
      const logo = branding?.logoUrl ? await loadImageDataUrl(branding.logoUrl) : null;

      // === COVER PAGE ===
      // Solid dark background
      doc.setFillColor(sr, sg, sb);
      doc.rect(0, 0, pageW, pageH, 'F');

      // Accent diagonal band (rectangle behind)
      doc.setFillColor(pr, pg, pb);
      doc.rect(0, pageH * 0.62, pageW, 1.5, 'F');
      doc.setFillColor(pr, pg, pb);
      doc.rect(0, pageH * 0.66, pageW * 0.35, 0.8, 'F');

      // Logo on cover (centered, top)
      if (logo) {
        const maxW = 55;
        const ratio = logo.width / logo.height;
        const w = maxW;
        const h = w / ratio;
        // White rounded card behind logo for visibility
        const cardW = w + 18;
        const cardH = h + 18;
        const cx = (pageW - cardW) / 2;
        const cy = pageH * 0.10;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(cx, cy, cardW, cardH, 4, 4, 'F');
        doc.addImage(logo.dataUrl, logo.format as any, cx + 9, cy + 9, w, h);
      }

      // Title block
      const titleY = pageH * 0.38;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(pr, pg, pb);
      doc.text('RELATÓRIO', pageW / 2, titleY, { align: 'center', charSpace: 4 });

      doc.setFontSize(34);
      doc.setTextColor(255, 255, 255);
      doc.text('Pesquisa de', pageW / 2, titleY + 14, { align: 'center' });
      doc.text('Clima Organizacional', pageW / 2, titleY + 26, { align: 'center' });

      // Company name
      doc.setFontSize(20);
      doc.setTextColor(255, 255, 255);
      doc.text(companyName, pageW / 2, pageH * 0.72, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.setTextColor(200, 200, 220);
      doc.text(surveyTitle, pageW / 2, pageH * 0.77, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(160, 160, 190);
      doc.text(
        new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
        pageW / 2, pageH * 0.82, { align: 'center' },
      );

      doc.setFontSize(8);
      doc.setTextColor(120, 120, 150);
      doc.text('Confidencial — Uso exclusivo da empresa', pageW / 2, pageH - 12, { align: 'center' });

      // === Header drawer ===
      const drawHeader = (title: string) => {
        doc.setFillColor(sr, sg, sb);
        doc.rect(0, 0, pageW, 16, 'F');
        doc.setFillColor(pr, pg, pb);
        doc.rect(0, 16, pageW, 1.2, 'F');

        // Logo small in header
        if (logo) {
          const h = 9;
          const w = h * (logo.width / logo.height);
          doc.addImage(logo.dataUrl, logo.format as any, 8, 3.5, w, h);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(title, logo ? 30 : 12, 10.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(200, 200, 220);
        doc.text(companyName, pageW - 12, 10.5, { align: 'right' });
      };

      // === ÍNDICE ===
      doc.addPage();
      drawHeader('Índice');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(sr, sg, sb);
      doc.text('Conteúdo do Relatório', 15, 32);
      doc.setDrawColor(pr, pg, pb);
      doc.setLineWidth(0.7);
      doc.line(15, 35, 60, 35);

      let y = 48;
      selectedSections.forEach((sec, i) => {
        if (y > pageH - 25) { doc.addPage(); drawHeader('Índice (cont.)'); y = 32; }
        // Number circle
        doc.setFillColor(pr, pg, pb);
        doc.circle(19, y - 2, 4, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(String(i + 1), 19, y - 0.5, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(40, 40, 60);
        doc.text(sec.label, 28, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 140);
        doc.text(sec.description, 28, y + 4.8);
        y += 13;
      });

      // === SECTIONS ===
      for (let si = 0; si < selectedSections.length; si++) {
        const sec = selectedSections[si];
        doc.addPage();
        drawHeader(`${si + 1}. ${sec.label}`);

        let startY = 26;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(sr, sg, sb);
        doc.text(sec.label, 15, startY);
        doc.setDrawColor(pr, pg, pb);
        doc.setLineWidth(0.6);
        doc.line(15, startY + 2, 15 + doc.getTextWidth(sec.label), startY + 2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(110, 110, 130);
        doc.text(sec.description, 15, startY + 9);
        startY += 16;

        // Try to render a chart for this section
        try {
          const rows = sec.data.rows;
          if (rows.length > 0 && rows.length <= 25) {
            // Find numeric column (prefer last)
            const numericColIdx: number[] = [];
            for (let c = sec.data.headers.length - 1; c >= 1; c--) {
              const numCount = rows.filter(r => parseNumeric(r[c]) !== null).length;
              if (numCount >= Math.max(2, Math.floor(rows.length * 0.6))) {
                numericColIdx.push(c);
                if (numericColIdx.length >= 2) break;
              }
            }
            if (numericColIdx.length > 0) {
              const valCol = numericColIdx[numericColIdx.length - 1]; // pick first found from the right (last column)
              const colHeader = sec.data.headers[valCol];
              const labels = rows.map(r => String(r[0]).length > 45 ? String(r[0]).substring(0, 44) + '…' : String(r[0]));
              const values = rows.map(r => parseNumeric(r[valCol]) ?? 0);
              const maxVal = Math.max(...values);
              const suggestedMax = maxVal <= 5 ? 5 : maxVal <= 10 ? 10 : maxVal <= 100 ? 100 : Math.ceil(maxVal * 1.1);

              // Color bars by performance if 0..scaleMax style
              const barColors = values.map(v => {
                const pct = suggestedMax > 0 ? (v / suggestedMax) * 100 : 0;
                if (pct >= 75) return '#10b981';
                if (pct >= 50) return '#fbbf24';
                return '#ef4444';
              });

              const chartH = Math.max(260, Math.min(520, rows.length * 26 + 80));
              const dataUrl = await renderChartDataUrl({
                type: 'bar',
                data: {
                  labels,
                  datasets: [{ label: colHeader, data: values, backgroundColor: barColors, borderRadius: 4 }],
                },
                options: {
                  indexAxis: 'y',
                  plugins: {
                    legend: { display: false },
                    title: { display: true, text: colHeader, color: secondary, font: { size: 16, weight: 'bold' as any } },
                  },
                  scales: {
                    x: { beginAtZero: true, suggestedMax, grid: { color: '#e5e7eb' }, ticks: { color: '#374151' } },
                    y: { grid: { display: false }, ticks: { color: '#374151', font: { size: 12 } } },
                  },
                },
              }, 1100, chartH);

              // Insert image, scale to fit width
              const imgW = pageW - 30;
              const imgH = imgW * (chartH / 1100);
              if (startY + imgH > pageH - 20) { doc.addPage(); drawHeader(`${si + 1}. ${sec.label} (cont.)`); startY = 26; }
              doc.addImage(dataUrl, 'PNG', 15, startY, imgW, imgH);
              startY += imgH + 6;
            }
          }
        } catch (e) {
          // chart failed, continue with table only
        }

        // Draw table
        autoTable(doc, {
          startY,
          head: [sec.data.headers],
          body: sec.data.rows.map(row => row.map(c => String(c))),
          styles: { fontSize: 8.5, cellPadding: 3, overflow: 'linebreak', textColor: [40, 40, 60] },
          headStyles: {
            fillColor: [sr, sg, sb],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
            cellPadding: 3.5,
          },
          alternateRowStyles: { fillColor: [248, 248, 252] },
          margin: { left: 15, right: 15 },
          tableWidth: 'auto',
          theme: 'grid',
          tableLineColor: [230, 230, 240],
          tableLineWidth: 0.1,
        });
      }

      // === Footer ===
      const totalPages = doc.getNumberOfPages();
      for (let i = 2; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(220, 220, 230);
        doc.setLineWidth(0.2);
        doc.line(15, pageH - 12, pageW - 15, pageH - 12);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 170);
        doc.text('Confidencial — Uso exclusivo da empresa', 15, pageH - 7);
        doc.text(`${i} / ${totalPages}`, pageW - 15, pageH - 7, { align: 'right' });
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
