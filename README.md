# Kripta
Frontend da Kripta: landing page pública, autenticação com Supabase e uma experiência de análise de criptomoedas com chat e agente de IA.

## Rodar localmente

```bash
npm install
Copy-Item .env.example .env.local # no PowerShell, e preencha as variáveis
npm run dev
```

Para validar o pacote de produção:

```bash
npm run build
```

## Recursos implementados

- Landing page pública em `/`, com hero, marquees, bento, acordeões, mockups interativos, planos, depoimentos, passo a passo, CTA e animações de rolagem.
- Login em `/login` e cadastro em `/cadastro`, com validação, recuperação de senha e Google OAuth via Supabase Auth.
- Área autenticada em `/app/*`, protegida por uma sessão real do Supabase.
- Tema escuro padrão e tema claro persistido em `localStorage`.
- Rotas para chat, agente, criptomoedas, histórico por cripto, plugins, perfil, planos e configurações.
- Lista das 24 criptomoedas, busca normalizada e chats contextuais.
- Composer com anexos simulados, envio por Enter, escolha de esforço e modo de voz simulado.
- Animação reutilizável do Koin em canvas, respostas com efeito de streaming por palavras, preços e etapas de trabalho.
- Plugins, cupom `KRIPTA27`, upgrade de plano, perfil e preferências persistentes no navegador.
- Command palette com `Ctrl/Cmd + K`, sidebar colapsável e interface responsiva.

## Autenticação com Supabase

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em `.env.local`. O cadastro, login, recuperação de senha, Google OAuth, renovação de sessão e logout usam o Supabase Auth. A chave publicável é própria para o frontend; nunca use uma chave `service_role` no navegador.

Quando “Lembrar de mim” está marcado, a sessão é persistida no `localStorage`; desmarcado, permanece apenas no `sessionStorage`. Nome, usuário e avatar padrão são salvos nos metadados seguros do usuário do Supabase. Se a confirmação de e-mail estiver ativa no projeto, o usuário precisa confirmar o link antes do primeiro acesso. Para o Google funcionar, habilite o provedor no painel do Supabase e cadastre as URLs de redirecionamento local e de produção.

Fluxo para testar: abra `/`, escolha **Começar agora**, cadastre-se, navegue pelo `/app`, use **Sair** no menu do perfil ou em Configurações → Conta e entre novamente em `/login`.

Os depoimentos, valores de mercado, alertas, análises e integrações com corretoras apresentados são placeholders ilustrativos. Nenhuma operação financeira ou recomendação é executada.

## Estrutura

- `src/main.tsx`: área autenticada, rotas e componentes do produto.
- `src/Landing.tsx`: landing pública e seus componentes interativos.
- `src/AuthPages.tsx`: login, cadastro e componentes compartilhados.
- `src/services/supabase/auth.ts`: cliente, sessão e operações de autenticação do Supabase.
- `src/styles.css`: tokens dos dois temas e estilos responsivos.
- `public/assets/`: logos, avatar, Koin e logos das criptomoedas processados.
- `scripts/crop-assets.mjs`: processamento reprodutível de logos e do sprite de criptomoedas. Execute `npm run assets:crop` caso os materiais sejam substituídos.

## Decisões

O app usa Vite, React, TypeScript, React Router e Supabase Auth. As integrações com corretoras, IA e pagamentos continuam demonstrativas. A animação do Koin preserva o canvas transparente, reprodução estática com movimento reduzido e interação por hover/clique.
