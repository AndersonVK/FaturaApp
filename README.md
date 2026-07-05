# FaturaApp

PWA pessoal para controle de faturas de cartão de crédito (Itaú), usadas tanto
para gastos pessoais quanto de empresas diferentes. 100% client-side: sem
backend, dados no IndexedDB do navegador (via Dexie.js), com backup/restauração
manual via arquivo JSON.

## Stack

Vite + React + TypeScript + Tailwind CSS v4 + Dexie.js + pdfjs-dist +
react-router (HashRouter) + vite-plugin-pwa.

## Desenvolvimento

```sh
npm install
npm run dev
```

## Build

```sh
npm run build   # tsc -b && vite build
npm run lint    # oxlint
```

## Deploy

Publicado automaticamente no GitHub Pages via GitHub Actions
(`.github/workflows/deploy.yml`) a cada push na branch `main`. É necessário
habilitar "GitHub Actions" como origem em Settings → Pages no repositório.

## Estrutura

- `src/db` — schema Dexie (IndexedDB) e tipos.
- `src/lib/parser-itau` — parser de PDF de fatura Itaú (pdfjs-dist).
- `src/lib/classificacao` — motor de classificação automática de Pessoa por
  lançamento e persistência da importação.
- `src/features/*` — telas do app.
