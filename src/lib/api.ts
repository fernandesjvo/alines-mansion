import type { Imovel } from "./mock-data";

export interface ScrapeResponse {
    success: boolean;
    count: number;
    imoveis: Imovel[];
    scrapedAt: string;
    error?: string;
}

/**
 * Chama o backend para fazer scraping de uma URL do QuintoAndar.
 * O proxy do Vite redireciona /api → http://localhost:3001
 */
export async function scrapeUrl(url: string): Promise<ScrapeResponse> {
    const response = await fetch("/api/scrape", {
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
    const response = await fetch("/api/export/csv", {
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
