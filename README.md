# Motora

Web app (SPA) com cadastro/login via Supabase Auth (email + senha).

## Stack

- Vite + React
- Supabase (Auth + Postgres) — banco compartilhado com o projeto Crushroll
- Deploy: build estático publicado via FTP na Hostinger
- Versionamento: git

## Setup local

```bash
npm install
cp .env.example .env
# preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env
npm run dev
```

O `.env` já vem preenchido neste entrega com as credenciais do projeto Crushroll. Ele está no `.gitignore` — nunca será commitado.

## Estrutura

```
src/
  supabaseClient.js   -> instância única do client Supabase
  App.jsx             -> gerencia sessão, alterna Auth/Dashboard
  pages/
    Auth.jsx           -> formulário de login/cadastro
    Dashboard.jsx       -> tela pós-login (placeholder)
```

## Autenticação

Fluxo 100% client-side via `@supabase/supabase-js`:

- **Cadastro**: `supabase.auth.signUp`. Se a confirmação de email estiver ativa no projeto Supabase, o usuário recebe um email e só ganha sessão após confirmar.
- **Login**: `supabase.auth.signInWithPassword`.
- **Sessão**: persistida automaticamente pelo SDK (localStorage) e observada via `onAuthStateChange`.

### Verificar/ajustar confirmação de email

No painel Supabase do projeto Crushroll: `Authentication > Providers > Email` — ativar ou desativar "Confirm email" conforme o comportamento desejado.

### RLS (Row Level Security)

Como o client fala direto com o Supabase usando a Anon Key, qualquer tabela nova deve ter RLS habilitado com policies explícitas. Sem isso, dados ficam expostos ou inacessíveis por padrão. Nenhuma tabela de aplicação foi criada nesta entrega — só o cadastro/login usa `auth.users`, que já é gerenciado pelo Supabase.

## Git

```bash
git init
git add .
git commit -m "Setup inicial: cadastro e login com Supabase Auth"
git branch -M main
git remote add origin <url-do-repositorio>
git push -u origin main
```

O `.env` não vai para o repositório. Quem clonar precisa copiar `.env.example` para `.env` e preencher as credenciais.

## Deploy (Hostinger via FTP)

1. Gerar o build de produção:
   ```bash
   npm run build
   ```
   Isso gera a pasta `dist/` com HTML/CSS/JS estáticos.

2. Enviar o **conteúdo** de `dist/` (não a pasta em si) para a raiz pública do domínio na Hostinger (geralmente `public_html/`), via FTP/FileZilla ou o gerenciador de arquivos do hPanel.

3. Como é uma SPA com rota única (sem client-side routing por enquanto), não é necessário configurar rewrite de rotas no `.htaccess`. Se rotas forem adicionadas depois (React Router), será preciso um `.htaccess` com fallback para `index.html`.

4. As credenciais do Supabase (Anon Key) ficam embutidas no JS buildado — isso é esperado e seguro, pois a Anon Key é pública por design. A segurança real está nas policies de RLS do banco.
