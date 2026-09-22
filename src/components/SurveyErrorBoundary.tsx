import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Copy } from 'lucide-react';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class SurveyErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('SurveyErrorBoundary caught:', error, info);
  }

  reload = () => {
    window.location.reload();
  };

  copyError = async () => {
    const txt = `${this.state.error?.name}: ${this.state.error?.message}\n\n${this.state.error?.stack || ''}`;
    try { await navigator.clipboard.writeText(txt); } catch {}
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-md w-full text-center bg-white rounded-2xl border shadow-sm p-8">
          <div className="w-14 h-14 rounded-full bg-secondary mx-auto mb-4 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-[hsl(var(--warning))]" />
          </div>
          <h1 className="text-xl font-bold mb-2">Algo deu errado</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Ocorreu um erro inesperado, mas o que você já respondeu nesta etapa está salvo no seu navegador.
            Clique em "Tentar novamente" para continuar de onde parou.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={this.reload} className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
            </Button>
            <Button onClick={this.copyError} variant="outline" size="sm" className="w-full">
              <Copy className="mr-2 h-3 w-3" /> Copiar detalhes do erro
            </Button>
          </div>
          {this.state.error && (
            <p className="mt-4 text-xs text-muted-foreground break-all">
              {this.state.error.message}
            </p>
          )}
        </div>
      </div>
    );
  }
}
