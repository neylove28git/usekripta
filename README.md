# Kripta
Frontend da Kripta: uma experiência de análise de criptomoedas com chat e agente de IA, construída a partir das referências visuais fornecidas.

## Rodar localmente

```bash
npm install
npm run dev
```

Para validar o pacote de produção:

```bash
npm run build
```

## Recursos implementados

- Tema escuro padrão e tema claro persistido em `localStorage`.
- Rotas para chat, agente, criptomoedas, histórico por cripto, plugins, perfil, planos e configurações.
- Lista das 24 criptomoedas, busca normalizada e chats contextuais.
- Composer com anexos simulados, envio por Enter, escolha de esforço e modo de voz simulado.
- Animação reutilizável do Koin em canvas, respostas com efeito de streaming por palavras, preços e etapas de trabalho.
- Plugins, cupom `KRIPTA27`, upgrade de plano, perfil e preferências persistentes no navegador.
- Command palette com `Ctrl/Cmd + K`, sidebar colapsável e interface responsiva.

## Estrutura

- `src/main.tsx`: aplicação React, rotas e componentes da interface.
- `src/styles.css`: tokens dos dois temas e estilos responsivos.
- `src/services/mock/`: contratos e funções assíncronas mockadas, ponto de troca futuro pelas APIs reais.
- `public/assets/`: logos, avatar, Koin e logos das criptomoedas processados.
- `scripts/crop-assets.mjs`: processamento reprodutível de logos e do sprite de criptomoedas. Execute `npm run assets:crop` caso os materiais sejam substituídos.

## Decisões

O app usa Vite, React, TypeScript e React Router. Dados remotos foram propositalmente modelados como mocks; não há chamadas para corretoras, IA, pagamentos ou serviços de e-mail. A animação do Koin preserva o canvas transparente, reprodução estática com movimento reduzido e interação por hover/clique.
