import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { setDefaultOptions } from 'date-fns/setDefaultOptions';
import { ptBR } from 'date-fns/locale';
import App from './App.tsx';
import './index.css';

setDefaultOptions({ locale: ptBR });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
