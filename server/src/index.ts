import Fastify from "fastify";
import cors from "@fastify/cors";
import { scrapeQuintoAndar } from "./scraper.js";
import { generateCSV } from "./csv.js";
import type { ScrapeRequest, ScrapeResponse, Imovel } from "./types.js";

const server = Fastify({
    logger: true,
});

// ─── CORS ──────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : true; // Em dev, permite qualquer origem

await server.register(cors, {
    origin: allowedOrigins,
});

// ─── POST /api/scrape ──────────────────────────────────────────
// Recebe uma URL do QuintoAndar e retorna os imóveis extraídos
server.post<{ Body: ScrapeRequest }>("/api/scrape", async (request, reply) => {
    const { url, maxScrolls } = request.body;

    if (!url || !url.includes("quintoandar")) {
        return reply.status(400).send({
            success: false,
            count: 0,
            imoveis: [],
            scrapedAt: new Date().toISOString(),
            error: "URL inválida. Forneça uma URL válida do QuintoAndar.",
        } satisfies ScrapeResponse);
    }

    try {
        server.log.info(`Iniciando scraping: ${url} (maxScrolls: ${maxScrolls || 'default'})`);
        const imoveis = await scrapeQuintoAndar(url, maxScrolls);

        const response: ScrapeResponse = {
            success: true,
            count: imoveis.length,
            imoveis,
            scrapedAt: new Date().toISOString(),
        };

        return reply.send(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido no scraping";
        server.log.error(`Erro no scraping: ${message}`);

        return reply.status(500).send({
            success: false,
            count: 0,
            imoveis: [],
            scrapedAt: new Date().toISOString(),
            error: `Falha no scraping: ${message}`,
        } satisfies ScrapeResponse);
    }
});

// ─── POST /api/export/csv ──────────────────────────────────────
// Recebe um array de imóveis no body e retorna CSV para download
server.post<{ Body: { imoveis: Imovel[] } }>("/api/export/csv", async (request, reply) => {
    const { imoveis } = request.body;

    if (!imoveis || !Array.isArray(imoveis) || imoveis.length === 0) {
        return reply.status(400).send({ error: "Nenhum imóvel fornecido para exportação." });
    }

    const csv = generateCSV(imoveis);

    return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", 'attachment; filename="imoveis-quintoandar.csv"')
        .send(csv);
});

// ─── Rota raiz (info) ──────────────────────────────────────────
server.get("/", async () => {
    return {
        name: "Aline's Mansion API",
        version: "2.0",
        frontend: "https://fernandesjvo.github.io/alines-mansion",
        endpoints: {
            "POST /api/scrape": "Scraping de URL do QuintoAndar",
            "POST /api/export/csv": "Exportar imóveis para CSV",
            "GET /api/health": "Health check",
        },
    };
});

// ─── Health check ──────────────────────────────────────────────
server.get("/api/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
});

// ─── Start server ──────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3001", 10);

try {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`   POST /api/scrape         — Scraping de URL do QuintoAndar`);
    console.log(`   POST /api/export/csv     — Exportar imóveis para CSV`);
    console.log(`   GET  /api/health         — Health check\n`);
} catch (err) {
    server.log.error(err);
    process.exit(1);
}
