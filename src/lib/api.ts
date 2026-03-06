import type { Imovel } from "./mock-data";

export interface ScrapeResponse {
    success: boolean;
    count: number;
    imoveis: Imovel[];
    scrapedAt: string;
    error?: string;
}

/**
 * Detecta a URL base da API dependendo do ambiente.
 * - Em desenvolvimento (localhost): usa proxy do Vite → ""
 * - Em produção (GitHub Pages): usa a URL do Render
 */
function getApiBaseUrl(): string {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
        return ""; // Proxy do Vite redireciona /api → localhost:3001
    }
    // Em produção, usa a variável de ambiente ou URL padrão do Render
    return import.meta.env.VITE_API_URL || "https://alines-mansion.onrender.com";
}

/**
 * Chama o backend para fazer scraping de uma URL do QuintoAndar.
 */
export async function scrapeUrl(url: string): Promise<ScrapeResponse> {
    const baseUrl = getApiBaseUrl();

    const response = await fetch(`${baseUrl}/api/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
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
