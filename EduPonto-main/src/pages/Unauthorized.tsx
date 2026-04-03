import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';

export function Unauthorized() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center transition-colors duration-300">
      <div className="bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-full mb-6">
        <ShieldAlert size={64} />
      </div>
      <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Acesso Negado</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md">
        Você não tem permissão para acessar esta página. Se você acredita que isso é um erro, entre em contato com a secretaria da escola.
      </p>
      <Link to="/">
        <Button className="gap-2">
          <ArrowLeft size={18} />
          <span>Voltar para o Dashboard</span>
        </Button>
      </Link>
    </div>
  );
}
