import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { queryClient } from './lib/query';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><BrowserRouter basename={import.meta.env.BASE_URL}><AuthProvider><App /></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>);
