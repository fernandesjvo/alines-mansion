import type { Imovel } from "./mock-data";

export interface ScrapeResponse {
    success: boolean;
    count: number;
    imoveis: Imovel[];
    scrapedAt: string;
    error?: string;
}

export interface ScrapeProgressEvent {
    percent: number;
    message: string;
    step: "init" | "navigating" | "scrolling" | "extracting" | "done" | "error";
    data?: any;
}

/**
 * Detecta a URL base da API dependendo do ambiente.
 * - Em desenvolvimento (localhost): usa proxy do Vite → ""
 * - Em produção (GitHub Pages): usa a URL do Render
 */
export function getApiBaseUrl(): string {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
        return ""; // Proxy do Vite redireciona /api → localhost:3001
    }
    // Em produção, usa a variável de ambiente ou URL padrão do Render
    return import.meta.env.VITE_API_URL || "https://alines-mansion.onrender.com";
}

/**
 * Chama o backend para fazer scraping de uma URL do QuintoAndar.
 */
export async function scrapeUrl(url: string, maxScrolls?: number, jobId?: string): Promise<ScrapeResponse> {
    const baseUrl = getApiBaseUrl();

    const response = await fetch(`${baseUrl}/api/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, maxScrolls, jobId }),
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
            errorBody?.error || `Erro no servidor: ${response.status} ${response.statusText}`
        );
    }

    return response.json();
}

/**
 * Faz download do CSV via backend.
 * Envia os imóveis para o servidor gerar o CSV.
 */
export async function downloadCSVFromServer(imoveis: Imovel[]): Promise<void> {
    const baseUrl = getApiBaseUrl();

    const response = await fetch(`${baseUrl}/api/export/csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imoveis }),
    });

    if (!response.ok) {
        throw new Error("Erro ao gerar CSV no servidor.");
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "imoveis-quintoandar.csv";
    a.click();
    URL.revokeObjectURL(blobUrl);
}

/**
 * Conecta ao canal SSE de progresso para um jobId específico.
 * Retorna uma função para fechar a conexão.
 */
export function listenToProgress(jobId: string, onProgress: (event: ScrapeProgressEvent) => void): () => void {
    const baseUrl = getApiBaseUrl();
    const eventSource = new EventSource(`${baseUrl}/api/progress/${jobId}`);

    eventSource.addEventListener("progress", (event) => {
        try {
            const data = JSON.parse(event.data) as ScrapeProgressEvent;
            onProgress(data);
        } catch (err) {
            console.error("Erro ao parsear evento de progresso:", err);
        }
    });

    eventSource.onerror = (err) => {
        console.error("Erro na conexão SSE:", err);
    };

    return () => {
        eventSource.close();
    };
}

/**
 * Envia uma lista de URLs para o servidor verificar disponibilidade.
 */
export async function checkAvailability(urls: string[], jobId?: string): Promise<{ success: boolean; results: Record<string, boolean>; error?: string }> {
    const baseUrl = getApiBaseUrl();

    const response = await fetch(`${baseUrl}/api/check-availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, jobId }),
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
            errorBody?.error || `Erro no servidor: ${response.status} ${response.statusText}`
        );
    }

    return response.json();
}
