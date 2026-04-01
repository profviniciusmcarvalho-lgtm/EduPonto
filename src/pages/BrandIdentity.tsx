import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Loader2, Download, RefreshCw, CheckCircle2, BellRing } from 'lucide-react';
import { useNotifications } from '@/src/hooks/useNotifications';

export function BrandIdentity() {
  const [generating, setGenerating] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [generatedLogos, setGeneratedLogos] = useState<string[]>([]);
  const { token, permission, requestPermission } = useNotifications();

  const sendTestNotification = async () => {
    if (!token) {
      alert("Por favor, ative as notificações primeiro clicando no sino no menu lateral.");
      return;
    }

    setSendingTest(true);
    try {
      const response = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          title: 'Teste EduPonto',
          body: 'Esta é uma notificação de teste da sua nova identidade visual!'
        })
      });
      
      if (response.ok) {
        alert("Notificação enviada com sucesso!");
      } else {
        const error = await response.json();
        alert(`Erro ao enviar: ${error.details || error.error}`);
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      alert("Erro de rede ao enviar notificação.");
    } finally {
      setSendingTest(false);
    }
  };

  const generateLogo = async () => {
    setGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: 'A modern, minimalist logo for a school time tracking app called "EduPonto". The logo should feature a stylized clock or point of entry, combined with educational elements like a book or a graduation cap. Professional, clean, blue and white color scheme. Vector style, flat design, high quality.',
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
          },
        },
      });

      const newLogos: string[] = [];
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          newLogos.push(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
      setGeneratedLogos(prev => [...newLogos, ...prev]);
    } catch (error) {
      console.error('Error generating logo:', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto py-8">
      <header className="text-center space-y-4">
        <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Identidade Visual EduPonto</h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg max-w-2xl mx-auto">
          Explore novas propostas de design para a marca EduPonto, focando em modernidade, educação e precisão.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <CardContent className="pt-12 pb-12 flex flex-col items-center justify-center text-center space-y-6">
            <div className="h-20 w-20 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200 dark:shadow-blue-900/20">
              <RefreshCw size={40} className={generating ? "animate-spin" : ""} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Gerar Novo Conceito</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Utilize IA para criar uma nova interpretação visual para o EduPonto.
              </p>
            </div>
            <Button 
              onClick={generateLogo} 
              disabled={generating}
              className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 h-12 text-lg font-bold"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Criando...
                </>
              ) : (
                'Gerar Logo com IA'
              )}
            </Button>

            <div className="w-full max-w-xs pt-4 border-t border-slate-200 dark:border-slate-800">
              <Button 
                variant="outline"
                onClick={sendTestNotification}
                disabled={sendingTest || !token}
                className="w-full gap-2"
              >
                {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing size={18} />}
                Testar Notificação Push
              </Button>
              {!token && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">
                  Ative as notificações no menu lateral para testar.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none border-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="text-green-500" size={20} />
              Conceito Atual (Componente)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="relative group">
              <div className="absolute -inset-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative h-32 w-32 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-2xl border border-slate-100 dark:border-slate-700">
                <div className="flex flex-col items-center">
                   <div className="relative">
                      <div className="h-16 w-16 rounded-full border-4 border-blue-600 flex items-center justify-center">
                        <div className="h-1 w-6 bg-blue-600 absolute top-1/2 left-1/2 origin-left -rotate-90"></div>
                        <div className="h-1 w-4 bg-blue-600 absolute top-1/2 left-1/2 origin-left rotate-0"></div>
                      </div>
                      <div className="absolute -top-4 -right-2 bg-blue-600 text-white p-1 rounded-sm rotate-12 shadow-md">
                        <div className="w-8 h-4 bg-blue-600 rounded-t-full border-b border-white/20"></div>
                      </div>
                   </div>
                </div>
              </div>
            </div>
            <div className="text-center">
              <h4 className="text-2xl font-black text-blue-600">EduPonto</h4>
              <p className="text-slate-400 dark:text-slate-500 text-xs uppercase tracking-[0.3em] font-bold">Gestão Inteligente</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {generatedLogos.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            Sugestões Geradas
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
              {generatedLogos.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {generatedLogos.map((logo, index) => (
              <Card key={index} className="overflow-hidden group hover:ring-2 hover:ring-blue-500 transition-all">
                <div className="aspect-square relative bg-slate-100 dark:bg-slate-800">
                  <img src={logo} alt={`Logo Sugestão ${index + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <Button variant="secondary" size="sm" className="gap-2" onClick={() => {
                      const link = document.createElement('a');
                      link.href = logo;
                      link.download = `eduponto-logo-${index + 1}.png`;
                      link.click();
                    }}>
                      <Download size={16} />
                      Baixar
                    </Button>
                  </div>
                </div>
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Conceito Moderno #{generatedLogos.length - index}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Gerado via IA</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
