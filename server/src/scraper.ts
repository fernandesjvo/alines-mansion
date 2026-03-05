import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Imovel } from "./types.js";

// Aplica o plugin stealth para evasão de detecção
chromium.use(StealthPlugin());

/** User-Agents reais para rotação */
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

/**
 * Limpa um valor de preço em texto para número.
 * "R$ 3.500" → 3500
 * "R$ 3.500,00" → 3500.00
 */
function cleanPrice(raw: string | number): number {
    if (typeof raw === "number") return raw;
    const cleaned = raw
        .replace(/[R$\s]/g, "")
        .replace(/\./g, "")
        .replace(",", ".");
    return parseFloat(cleaned) || 0;
}

/**
 * Tenta extrair o tipo do imóvel a partir dos dados da API.
 */
function extractTipo(house: Record<string, unknown>): string {
    const type = (house.type as string) || (house.unitType as string) || "";
    const typeMap: Record<string, string> = {
        APARTMENT: "Apartamento",
        HOUSE: "Casa",
        STUDIO: "Studio",
        CONDO: "Condomínio",
        PENTHOUSE: "Cobertura",
        LOFT: "Loft",
        KITNET: "Kitnet",
    };
    return typeMap[type.toUpperCase()] || type || "Apartamento";
}

/**
 * Delay com variação para simular comportamento humano.
 */
function humanDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Realiza o scraping de uma URL do QuintoAndar.
 *
 * Estratégia:
 * 1. Abre browser headless com stealth plugin
 * 2. Intercepta respostas de rede GraphQL (listHouses)
 * 3. Rola a página para disparar infinite scroll
 * 4. Limpa e normaliza os dados
 */
export async function scrapeQuintoAndar(url: string): Promise<Imovel[]> {
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const collectedHouses: Map<string, Imovel> = new Map();

    console.log(`[scraper] Iniciando scraping: ${url}`);
    console.log(`[scraper] User-Agent: ${userAgent}`);

    const browser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
        ],
    });

    try {
        const context = await browser.newContext({
            userAgent,
            viewport: { width: 1920, height: 1080 },
            locale: "pt-BR",
            timezoneId: "America/Sao_Paulo",
        });

        const page = await context.newPage();

        // ─── Interceptação de rede GraphQL ─────────────────────────
        page.on("response", async (response) => {
            try {
                const reqUrl = response.url();
                const postData = response.request().postData() || "";

                // Captura respostas do endpoint GraphQL que contêm dados de listagem
                const isGraphQL =
                    reqUrl.includes("graphql") ||
                    reqUrl.includes("/api/") ||
                    reqUrl.includes("gateway");

                const isListData =
                    postData.includes("listHouses") ||
                    postData.includes("searchListings") ||
                    postData.includes("search") ||
                    reqUrl.includes("search") ||
                    reqUrl.includes("list");

                if (isGraphQL || isListData) {
                    const contentType = response.headers()["content-type"] || "";
                    if (!contentType.includes("json")) return;

                    const body = await response.json().catch(() => null);
                    if (!body) return;

                    // Procura arrays de imóveis recursivamente no JSON
                    extractHousesFromJSON(body, collectedHouses, url);
                }
            } catch {
                // Ignora erros de respostas individuais
            }
        });

        // ─── Navegação ─────────────────────────────────────────────
        console.log("[scraper] Navegando para a página...");
        await page.goto(url, {
            waitUntil: "networkidle",
            timeout: 60000,
        });

        // Espera a página carregar completamente
        await humanDelay(2000, 4000);

        // ─── Scroll para carregar mais imóveis ─────────────────────
        const SCROLL_COUNT = 5;
        console.log(`[scraper] Iniciando ${SCROLL_COUNT} scrolls...`);

        for (let i = 0; i < SCROLL_COUNT; i++) {
            await page.evaluate(() => {
                window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: "smooth",
                });
            });

            // Espera carregar novos dados
            await humanDelay(2000, 4000);

            // Tenta clicar em botão "carregar mais" se existir
            try {
                const loadMoreBtn = page.locator(
                    'button:has-text("Mostrar mais"), button:has-text("Carregar mais"), button:has-text("Ver mais")'
                );
                if (await loadMoreBtn.first().isVisible({ timeout: 1000 })) {
                    await loadMoreBtn.first().click();
                    await humanDelay(2000, 3000);
                }
            } catch {
                // Sem botão "carregar mais"
            }

            console.log(
                `[scraper] Scroll ${i + 1}/${SCROLL_COUNT} — ${collectedHouses.size} imóveis coletados`
            );
        }

        // ─── Fallback: extrai dados do DOM se a interceptação não capturou nada
        if (collectedHouses.size === 0) {
            console.log("[scraper] Nenhum dado via interceptação. Tentando extração via DOM...");
            const domHouses = await extractFromDOM(page, url);
            for (const house of domHouses) {
                collectedHouses.set(house.id, house);
            }
        }

        await context.close();
    } finally {
        await browser.close();
    }

    const result = Array.from(collectedHouses.values());
    console.log(`[scraper] Scraping finalizado. ${result.length} imóveis encontrados.`);
    return result;
}

/**
 * Extrai imóveis de um JSON arbitrário recursivamente.
 * A API do QuintoAndar pode retornar dados em diversas estruturas.
 */
function extractHousesFromJSON(
    obj: unknown,
    map: Map<string, Imovel>,
    baseUrl: string
): void {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
        for (const item of obj) {
            extractHousesFromJSON(item, map, baseUrl);
        }
        return;
    }

    const record = obj as Record<string, unknown>;

    // Verifica se o objeto parece ser um imóvel
    const hasId = record.id || record.houseId || record.listingId || record._id;
    const hasPrice =
        record.rent !== undefined ||
        record.totalCost !== undefined ||
        record.price !== undefined ||
        record.rentPrice !== undefined ||
        record.preco !== undefined;

    if (hasId && hasPrice) {
        const id = String(hasId);
        if (map.has(id)) return;

        const rawPrice =
            record.totalCost ?? record.rent ?? record.price ?? record.rentPrice ?? record.preco ?? 0;
        const price = cleanPrice(String(rawPrice));
        if (price <= 0) return;

        const area = Number(record.area ?? record.usableArea ?? record.areaMt2 ?? 0);
        const bairro = String(
            record.neighbourhood ?? record.neighborhood ?? record.bairro ?? record.regionName ?? ""
        );
        const quartos = Number(record.bedrooms ?? record.dorms ?? record.quartos ?? 0);
        const tipo = extractTipo(record);

        const imovel: Imovel = {
            id,
            bairro,
            areaMt2: area,
            precoTotal: price,
            precoPorMt2: area > 0 ? Math.round((price / area) * 100) / 100 : 0,
            link: `https://www.quintoandar.com.br/imovel/${id}`,
            quartos,
            tipo,
        };

        map.set(id, imovel);
    }

    // Continua buscando recursivamente em propriedades aninhadas
    for (const value of Object.values(record)) {
        if (value && typeof value === "object") {
            extractHousesFromJSON(value, map, baseUrl);
        }
    }
}

/**
 * Fallback: extrai dados diretamente do DOM da página (caso a interceptação falhe).
 */
async function extractFromDOM(
    page: import("playwright").Page,
    baseUrl: string
): Promise<Imovel[]> {
    return page.evaluate((baseUrl: string) => {
        const results: Array<{
            id: string;
            bairro: string;
            areaMt2: number;
            precoTotal: number;
            precoPorMt2: number;
            link: string;
            quartos: number;
            tipo: string;
        }> = [];

        // Tenta diversos seletores conhecidos do QuintoAndar
        const cards = document.querySelectorAll(
            '[data-testid="house-card"], [class*="HouseCard"], [class*="listing-card"], a[href*="/imovel/"]'
        );

        cards.forEach((card, index) => {
            try {
                const link = card.closest("a")?.href || card.querySelector("a")?.href || "";
                const idMatch = link.match(/imovel\/([^/?]+)/);
                const id = idMatch ? idMatch[1] : `dom-${index}`;

                // Tenta extrair preço do texto
                const priceText =
                    card.querySelector('[class*="price"], [class*="Price"], [class*="rent"], [class*="Rent"]')
                        ?.textContent || "";
                const priceMatch = priceText.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
                const price = parseFloat(priceMatch) || 0;

                // Tenta extrair área
                const areaText =
                    card.querySelector('[class*="area"], [class*="Area"]')?.textContent || "";
                const areaMatch = areaText.match(/(\d+)\s*m/);
                const area = areaMatch ? parseInt(areaMatch[1]) : 0;

                // Tenta extrair bairro
                const bairro =
                    card.querySelector('[class*="address"], [class*="Address"], [class*="neighborhood"]')
                        ?.textContent?.trim() || "";

                // Tenta extrair quartos
                const roomText =
                    card.querySelector('[class*="bed"], [class*="Bed"], [class*="room"], [class*="Room"]')
                        ?.textContent || "";
                const roomMatch = roomText.match(/(\d+)/);
                const quartos = roomMatch ? parseInt(roomMatch[1]) : 0;

                if (price > 0) {
                    results.push({
                        id,
                        bairro,
                        areaMt2: area,
                        precoTotal: price,
                        precoPorMt2: area > 0 ? Math.round((price / area) * 100) / 100 : 0,
                        link: link || `https://www.quintoandar.com.br/imovel/${id}`,
                        quartos,
                        tipo: "Apartamento",
                    });
                }
            } catch {
                // Ignora cards com erro
            }
        });

        return results;
    }, baseUrl);
}
