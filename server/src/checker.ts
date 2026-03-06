import type { ScrapeProgressEvent } from "./types.js";

/** User-Agents reais para rotação */
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
];

/**
 * Verifica a disponibilidade de uma lista de imóveis.
 * @param urls URLs dos anúncios do QuintoAndar a serem verificadas
 * @param onProgress Callback opcional para emissão de progresso via SSE
 * @returns Um mapa cujo chave é a URL e valor é se o imóvel está disponível (true/false)
 */
export async function checkAvailabilityBatch(
    urls: string[],
    onProgress?: (event: ScrapeProgressEvent) => void
): Promise<Record<string, boolean>> {
    const total = urls.length;
    let completed = 0;
    const results: Record<string, boolean> = {};

    const reportProgress = (percent: number, message: string) => {
        if (onProgress) {
            onProgress({
                percent,
                step: "extracting",
                message,
                data: { checked: completed, total }
            });
        }
    };

    reportProgress(5, "Iniciando verificador de disponibilidade...");

    // Remove duplicatas
    const uniqueUrls = Array.from(new Set(urls));
    const BATCH_SIZE = 10; // 10 conexões simultâneas

    for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
        const batch = uniqueUrls.slice(i, i + BATCH_SIZE);

        const promises = batch.map(async (url) => {
            const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
            let isAvailable = true;

            try {
                // native fetch for node 18+
                const res = await fetch(url, {
                    method: "GET",
                    headers: {
                        "User-Agent": userAgent,
                        "Accept": "text/html,application/xhtml+xml",
                        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                    },
                    // Prevent fetch from throwing on 404 redirects
                    redirect: "follow",
                });

                if (res.status === 404 || res.status === 410) {
                    isAvailable = false;
                } else if (res.ok) {
                    const html = await res.text();
                    // Checa por strings conhecidas que indicam indisponibilidade
                    if (
                        html.includes("Imóvel indisponível") ||
                        html.includes("Poxa, esse imóvel já foi alugado") ||
                        html.includes("Poxa, esse imóvel já foi vendido")
                    ) {
                        isAvailable = false;
                    }
                }
            } catch (err) {
                console.error(`Status Checker Error [${url}]:`, err);
                // Em caso de falha de rede pesada (timeout falso), assumimos que está disponível
                // para não excluir da lista do usuário acidentalmente
                isAvailable = true;
            }

            results[url] = isAvailable;
            completed++;
            const percent = Math.floor(10 + ((completed / uniqueUrls.length) * 85));
            reportProgress(percent, `Verificando imóveis (${completed}/${uniqueUrls.length})...`);
        });

        await Promise.allSettled(promises);

        // Pausa breve entre os lotes para não receber block 429
        if (i + BATCH_SIZE < uniqueUrls.length) {
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }

    reportProgress(100, `Concluído! ${completed} imóveis verificados.`);
    return results;
}
