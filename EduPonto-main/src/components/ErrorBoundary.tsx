import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "./ui/Button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Ocorreu um erro inesperado.";
      
      try {
        // Try to parse Firestore JSON error
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error && parsed.error.includes("insufficient permissions")) {
          errorMessage = "Você não tem permissão para realizar esta operação ou visualizar estes dados.";
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 rounded-full bg-red-100 dark:bg-red-900/20 p-3 text-red-600 dark:text-red-400">
            <AlertCircle size={48} />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-slate-100">Ops! Algo deu errado.</h2>
          <p className="mb-6 max-w-md text-slate-500 dark:text-slate-400">{errorMessage}</p>
          <Button
            onClick={() => window.location.reload()}
            className="gap-2"
          >
            <RefreshCcw size={18} />
            <span>Recarregar Página</span>
          </Button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default ErrorBoundary;
