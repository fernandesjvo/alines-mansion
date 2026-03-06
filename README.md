# Aline's Mansion — QuintoAndar Scraper

Ferramenta para automatizar a coleta e análise de anúncios de imóveis do QuintoAndar. O sistema contorna a volatilidade de classes CSS interceptando as requisições de rede (API GraphQL) para extrair dados limpos e estruturados.

## Tecnologias

- **Frontend:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Fastify
- **Scraping:** Playwright + stealth plugin (evasão Cloudflare)
- **Estratégia:** Interceptação de rede GraphQL (independente de CSS)

## Pré-requisitos

- **Node.js** v18 ou superior — [download](https://nodejs.org/)
- **Git** — [download](https://git-scm.com/)

> **Windows (PowerShell):** Se aparecer erro de "execução de scripts desabilitada", use o **Prompt de Comando (cmd)** ou rode primeiro:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

## Instalação

```bash
# 1. Clonar o repositório
git clone https://github.com/fernandesjvo/alines-mansion.git
cd alines-mansion

# 2. Instalar dependências do frontend
npm install

# 3. Instalar dependências do backend + navegador headless
cd server
npm install
npx playwright install chromium
cd ..
```

## Como rodar

Abra **dois terminais** na pasta do projeto:

**Terminal 1 — Backend (scraper):**
```bash
cd server
npm run dev
```
> Deve exibir: `🚀 Servidor rodando em http://localhost:3001`

**Terminal 2 — Frontend:**
```bash
npm run dev
```
> Deve exibir: `Local: http://localhost:8080/`

Acesse **http://localhost:8080/** no navegador, cole uma URL do QuintoAndar e clique **Analisar**.

### Exemplos de URLs para testar

- **Aluguel:** `https://www.quintoandar.com.br/alugar/imovel/sao-paulo-sp-brasil`
- **Compra:** `https://www.quintoandar.com.br/comprar/imovel/sao-paulo-sp-brasil/apartamento`

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/scrape` | Recebe `{ url }`, executa Playwright, retorna imóveis |
| `POST` | `/api/export/csv` | Recebe `{ imoveis }`, retorna arquivo CSV |
| `GET`  | `/api/health` | Health check |

### Exemplo de uso via curl

```bash
curl -X POST http://localhost:3001/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.quintoandar.com.br/alugar/imovel/sao-paulo-sp-brasil"}'
```

## Estrutura do projeto

```
alines-mansion/
├── src/                    # Frontend React
│   ├── pages/Index.tsx     # Página principal
│   ├── lib/api.ts          # Cliente API
│   └── components/         # Componentes UI
├── server/                 # Backend Node.js
│   └── src/
│       ├── index.ts        # Servidor Fastify
│       ├── scraper.ts      # Playwright + stealth
│       ├── types.ts        # Interfaces TypeScript
│       └── csv.ts          # Geração de CSV
└── vite.config.ts          # Config do Vite + proxy
```
