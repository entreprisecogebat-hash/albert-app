import { cssVariables } from '@albert/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import './styles.css';

// Tokens de la charte, injectes depuis le package partage
const style = document.createElement('style');
style.textContent = cssVariables();
document.head.prepend(style);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
