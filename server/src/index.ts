import Fastify from "fastify";
import cors from "@fastify/cors";
import { scrapeQuintoAndar } from "./scraper.js";
import { checkAvailabilityBatch } from "./checker.js";
import { generateCSV } from "./csv.js";
import type { ScrapeRequest, ScrapeResponse, Imovel, ScrapeProgressEvent } from "./types.js";
import { FastifySSEPlugin } from "fastify-sse-v2";
import { EventEmitter } from "events";

const server = Fastify({
    logger: true,
});

// Event emitter global para gerenciar progresso de scraping
const progressEmitter = new EventEmitter();
progressEmitter.setMaxListeners(100);

// ─── SSE Plugin ────────────────────────────────────────────────
await server.register(FastifySSEPlugin);

// ─── CORS ──────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : true; // Em dev, permite qualquer origem

await server.register(cors, {
    origin: allowedOrigins,
});

// ─── GET /api/progress/:jobId ──────────────────────────────────
// Conexão Server-Sent Events (SSE) para receber progresso em tempo real
server.get<{ Params: { jobId: string } }>("/api/progress/:jobId", async (request, reply) => {
    const { jobId } = request.params;

    // Configura o stream SSE
    reply.sse({
        id: String(Date.now()),
        event: "connected",
        data: JSON.stringify({ message: "Conectado ao canal de progresso" })
    });

    const onProgress = (data: ScrapeProgressEvent) => {
        reply.sse({
            id: String(Date.now()),
            event: "progress",
            data: JSON.stringify(data)
        });
    };

    // Escuta eventos específicos para este jobId
    progressEmitter.on(`progress-${jobId}`, onProgress);

    // Quando o cliente desconectar, remove o listener para evitar memory leaks
    request.raw.on("close", () => {
        progressEmitter.off(`progress-${jobId}`, onProgress);
    });
});

// ─── POST /api/scrape ──────────────────────────────────────────
// Recebe uma URL do QuintoAndar e retorna os imóveis extraídos
server.post<{ Body: ScrapeRequest }>("/api/scrape", async (request, reply) => {
    const { url, maxScrolls, jobId } = request.body;

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
        server.log.info(`Iniciando scraping: ${url} (maxScrolls: ${maxScrolls || 'default'}, jobId: ${jobId || 'none'})`);

        const onProgress = jobId
            ? (event: ScrapeProgressEvent) => progressEmitter.emit(`progress-${jobId}`, event)
            : undefined;

        const imoveis = await scrapeQuintoAndar(url, maxScrolls, onProgress);

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

// ─── POST /api/check-availability ──────────────────────────────
// Recebe uma lista de URLs de imóveis e verifica disponibilidade
interface CheckReq {
    urls: string[];
    jobId?: string;
}

server.post<{ Body: CheckReq }>("/api/check-availability", async (request, reply) => {
    const { urls, jobId } = request.body;

    if (!Array.isArray(urls) || urls.length === 0) {
        return reply.status(400).send({
            success: false,
            error: "Lista de URLs inválida vazia.",
        });
    }

    try {
        server.log.info(`Iniciando checagem de disponibilidade para ${urls.length} imóveis (jobId: ${jobId || 'none'})`);

        const onProgress = jobId
            ? (event: ScrapeProgressEvent) => progressEmitter.emit(`progress-${jobId}`, event)
            : undefined;

        const results = await checkAvailabilityBatch(urls, onProgress);

        return reply.send({
            success: true,
            results,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido na checagem";
        server.log.error(`Erro na checagem: ${message}`);

        return reply.status(500).send({
            success: false,
            error: `Falha na checagem de disponibilidade: ${message}`,
        });
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
