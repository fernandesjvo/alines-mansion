# Aline's Mansion — QuintoAndar Scraper

Ferramenta para automatizar a coleta e análise de anúncios de imóveis do QuintoAndar. O sistema contorna a volatilidade de classes CSS interceptando as requisições de rede (API GraphQL) para extrair dados limpos e estruturados.

## Tecnologias

- **Frontend:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Fastify
- **Scraping:** Playwright + stealth plugin (evasão Cloudflare)
- **Estratégia:** Interceptação de rede GraphQL (independente de CSS)

## Como rodar

```bash
# 1. Instalar dependências do frontend
npm install

# 2. Instalar dependências do backend
cd server
npm install
npx playwright install chromium
cd ..

# 3. Iniciar o backend (Terminal 1)
cd server
npm run dev

# 4. Iniciar o frontend (Terminal 2)
npm run dev
```

Acesse `http://localhost:8080`, cole uma URL do QuintoAndar e clique **Analisar**.

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/scrape` | Recebe `{ url }`, executa Playwright, retorna imóveis |
| `POST` | `/api/export/csv` | Recebe `{ imoveis }`, retorna arquivo CSV |
| `GET`  | `/api/health` | Health check |
