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
 * "R$ 3.500" → 3500 | "R$ 3.500,00" → 3500.00 | 150000 → 150000
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
    const type =
        (house.type as string) ||
        (house.unitType as string) ||
        (house.unitTypes as string) ||
        (house.businessContext as string) ||
        "";
    const typeMap: Record<string, string> = {
        APARTMENT: "Apartamento",
        HOUSE: "Casa",
        STUDIO: "Studio",
        CONDO: "Condomínio",
        PENTHOUSE: "Cobertura",
        LOFT: "Loft",
        KITNET: "Kitnet",
        SALE: "Venda",
        RENT: "Aluguel",
    };
    return typeMap[type.toUpperCase()] || type || "Imóvel";
}

/**
 * Delay com variação para simular comportamento humano.
 */
function humanDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Verifica se uma URL de rede é relevante para capturar dados de imóveis.
 */
function isRelevantUrl(reqUrl: string, postData: string): boolean {
    const urlLower = reqUrl.toLowerCase();
    const postLower = postData.toLowerCase();

    // URLs de API do QuintoAndar
    const relevantUrlPatterns = [
        "graphql",
        "/api/",
        "gateway",
        "search",
        "list",
        "houses",
        "listings",
        "properties",
        "bff",
        "v2/search",
        "v3/search",
        "sale",
        "comprar",
        "alugar",
        "rent",
        "result",
        "next/data",
        "_next/data",
        "page-data",
    ];

    // Termos no body GraphQL
    const relevantPostPatterns = [
        "listhouses",
        "searchlistings",
        "search",
        "houses",
        "listings",
        "properties",
        "saleproperties",
        "getlistings",
        "gethouselist",
        "query",
    ];

    const urlMatch = relevantUrlPatterns.some((p) => urlLower.includes(p));
    const postMatch = relevantPostPatterns.some((p) => postLower.includes(p));

    return urlMatch || postMatch;
}

/**
 * Realiza o scraping de uma URL do QuintoAndar.
 *
 * Estratégia ampliada:
 * 1. Abre browser headless com stealth plugin
 * 2. Captura TODAS as respostas JSON da rede
 * 3. Extrai recursivamente qualquer objeto que pareça um imóvel
 * 4. Rola a página para disparar infinite scroll
 * 5. Fallback robusto via DOM
 */
export async function scrapeQuintoAndar(url: string, maxScrolls: number = 4): Promise<Imovel[]> {
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const collectedHouses: Map<string, Imovel> = new Map();
    const isComprar = url.includes("comprar");

    console.log(`[scraper] Iniciando scraping: ${url}`);
    console.log(`[scraper] Modo: ${isComprar ? "COMPRA" : "ALUGUEL"}`);
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

        let capturedResponses = 0;

        // ─── Interceptação AMPLA de rede ───────────────────────────
        page.on("response", async (response) => {
            try {
                const status = response.status();
                if (status < 200 || status >= 400) return;

                const contentType = response.headers()["content-type"] || "";
                if (!contentType.includes("json")) return;

                const reqUrl = response.url();
                const postData = response.request().postData() || "";

                // Ignora assets, analytics, imagens, etc
                if (
                    reqUrl.includes("analytics") ||
                    reqUrl.includes("tracking") ||
                    reqUrl.includes("pixel") ||
                    reqUrl.includes("gtm") ||
                    reqUrl.includes("google") ||
                    reqUrl.includes("facebook") ||
                    reqUrl.includes("hotjar") ||
                    reqUrl.includes("sentry") ||
                    reqUrl.includes(".png") ||
                    reqUrl.includes(".jpg") ||
                    reqUrl.includes(".svg")
                ) {
                    return;
                }

                const body = await response.json().catch(() => null);
                if (!body) return;

                const sizeBefore = collectedHouses.size;
                extractHousesFromJSON(body, collectedHouses, isComprar);
                const sizeAfter = collectedHouses.size;

                capturedResponses++;
                if (sizeAfter > sizeBefore) {
                    console.log(
                        `[scraper] ✓ Capturou ${sizeAfter - sizeBefore} imóveis de: ${reqUrl.substring(0, 80)}...`
                    );
                }
            } catch {
                // Ignora erros de respostas individuais
            }
        });

        // ─── Navegação ─────────────────────────────────────────────
        console.log("[scraper] Navegando para a página...");
        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });

        // Espera tempo suficiente para as requisições principais
        await humanDelay(2500, 4000);

        console.log(
            `[scraper] Página carregada. ${capturedResponses} respostas JSON capturadas, ${collectedHouses.size} imóveis até agora.`
        );

        // ─── Scroll para carregar mais imóveis ─────────────────────
        const SCROLL_COUNT = maxScrolls;
        console.log(`[scraper] Iniciando ${SCROLL_COUNT} scrolls...`);

        for (let i = 0; i < SCROLL_COUNT; i++) {
            // Scroll gradual (mais realista)
            await page.evaluate(async () => {
                const totalHeight = document.body.scrollHeight;
                const viewportHeight = window.innerHeight;
                const currentScroll = window.scrollY;
                const targetScroll = Math.min(
                    currentScroll + viewportHeight * 1.5,
                    totalHeight
                );
                window.scrollTo({ top: targetScroll, behavior: "smooth" });
            });

            await humanDelay(1500, 2500);

            // Tenta clicar em botões de "carregar mais" / "ver mais"
            try {
                const loadMoreSelectors = [
                    'button:has-text("Mostrar mais")',
                    'button:has-text("Carregar mais")',
                    'button:has-text("Ver mais")',
                    'button:has-text("Próxima página")',
                    'a:has-text("Mostrar mais")',
                    'a:has-text("Ver mais")',
                    '[data-testid="load-more"]',
                    '[class*="load-more"]',
                    '[class*="LoadMore"]',
                    '[class*="pagination"] button',
                    '[class*="Pagination"] button',
                ];

                for (const selector of loadMoreSelectors) {
                    try {
                        const btn = page.locator(selector).first();
                        if (await btn.isVisible({ timeout: 500 })) {
                            await btn.click();
                            console.log(`[scraper] Clicou em: ${selector}`);
                            await humanDelay(1500, 2500);
                            break;
                        }
                    } catch {
                        // Selector não encontrado
                    }
                }
            } catch {
                // Sem botão de carregar mais
            }

            console.log(
                `[scraper] Scroll ${i + 1}/${SCROLL_COUNT} — ${collectedHouses.size} imóveis coletados`
            );
        }

        // Scroll final até o topo e volta para disparar possíveis lazy loads
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
        await humanDelay(500, 1000);
        await page.evaluate(() =>
            window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })
        );
        await humanDelay(1500, 2500);

        console.log(
            `[scraper] Pós-scroll: ${capturedResponses} respostas, ${collectedHouses.size} imóveis.`
        );

        // ─── Fallback: extrai dados do DOM ─────────────────────────
        if (collectedHouses.size === 0) {
            console.log(
                "[scraper] Nenhum dado via interceptação de rede. Extraindo via DOM..."
            );
            const domHouses = await extractFromDOM(page, isComprar);
            for (const house of domHouses) {
                collectedHouses.set(house.id, house);
            }
            console.log(
                `[scraper] Extraídos ${domHouses.length} imóveis via DOM.`
            );
        }

        await context.close();
    } finally {
        await browser.close();
    }

    const result = Array.from(collectedHouses.values());
    console.log(
        `[scraper] Scraping finalizado. ${result.length} imóveis encontrados.`
    );
    return result;
}

// ─── Campos de preço por contexto ────────────────────────────────
// Para COMPRA: prioriza preço de venda
const SALE_PRICE_FIELDS = [
    "salePrice",
    "sellingPrice",
    "listingPrice",
    "purchasePrice",
    "saleValue",
    "valorVenda",
    "price",
    "value",
    "totalCost",
    "cost",
    "preco",
];

// Para ALUGUEL: prioriza preço de aluguel
const RENT_PRICE_FIELDS = [
    "totalCost",
    "rent",
    "rentPrice",
    "rentTotalPrice",
    "monthlyPrice",
    "valorAluguel",
    "price",
    "value",
    "preco",
    "cost",
];

/**
 * Extrai o preço principal de um imóvel, priorizando pelo contexto (compra vs aluguel).
 * Evita capturar valores de condomínio/IPTU como preço principal.
 */
function extractMainPrice(record: Record<string, unknown>, isComprar: boolean): number {
    const priorityFields = isComprar ? SALE_PRICE_FIELDS : RENT_PRICE_FIELDS;

    // Tenta os campos prioritários primeiro
    for (const field of priorityFields) {
        const val = record[field];
        if (val !== undefined && val !== null && val !== "" && val !== 0) {
            const price = cleanPrice(String(val));
            // Para compra, ignora valores muito baixos (provavelmente condomínio/IPTU)
            if (isComprar && price < 10000) continue;
            // Para aluguel, ignora valores acima de 1 milhão (provavelmente preço de venda)
            if (!isComprar && price > 1000000) continue;
            if (price > 0) return price;
        }
    }

    // Fallback: qualquer campo com "price" ou "value" no nome
    for (const [key, val] of Object.entries(record)) {
        const keyLower = key.toLowerCase();
        if (
            (keyLower.includes("price") || keyLower.includes("valor") || keyLower.includes("value")) &&
            !keyLower.includes("condo") &&
            !keyLower.includes("iptu") &&
            !keyLower.includes("tax") &&
            val !== undefined && val !== null && val !== "" && val !== 0
        ) {
            const price = cleanPrice(String(val));
            if (isComprar && price < 10000) continue;
            if (price > 0) return price;
        }
    }

    return 0;
}

const ID_FIELDS = [
    "id",
    "houseId",
    "listingId",
    "_id",
    "propertyId",
    "houseID",
    "externalId",
    "sourceId",
    "adId",
    "announcementId",
    "code",
];

const AREA_FIELDS = [
    "area",
    "usableArea",
    "areaMt2",
    "totalArea",
    "areaM2",
    "size",
    "squareMeters",
    "sqm",
    "areaUtil",
    "privateArea",
];

const NEIGHBORHOOD_FIELDS = [
    "neighbourhood",
    "neighborhood",
    "bairro",
    "regionName",
    "region",
    "district",
    "address",
    "city",
    "location",
    "addressNeighborhood",
];

const BEDROOM_FIELDS = [
    "bedrooms",
    "dorms",
    "quartos",
    "dormitorios",
    "rooms",
    "bedroomCount",
    "qtdDorms",
    "qtdQuartos",
];

/**
 * Obtém o primeiro valor existente de um objeto, dada uma lista de possíveis chaves.
 */
function getField(record: Record<string, unknown>, fields: string[]): unknown {
    for (const field of fields) {
        if (record[field] !== undefined && record[field] !== null && record[field] !== "") {
            return record[field];
        }
    }
    return undefined;
}

/**
 * Extrai imóveis de um JSON arbitrário recursivamente.
 * Versão ampliada que reconhece mais padrões de dados.
 */
function extractHousesFromJSON(
    obj: unknown,
    map: Map<string, Imovel>,
    isComprar: boolean
): void {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
        for (const item of obj) {
            extractHousesFromJSON(item, map, isComprar);
        }
        return;
    }

    const record = obj as Record<string, unknown>;

    // Verifica se o objeto parece ser um imóvel
    const rawId = getField(record, ID_FIELDS);

    if (rawId) {
        const id = String(rawId);
        if (!map.has(id)) {
            const price = extractMainPrice(record, isComprar);
            if (price > 0) {
                const rawArea = getField(record, AREA_FIELDS);
                const area = Number(rawArea ?? 0);

                const rawBairro = getField(record, NEIGHBORHOOD_FIELDS);
                const bairro = rawBairro ? String(rawBairro) : "";

                const rawQuartos = getField(record, BEDROOM_FIELDS);
                const quartos = Number(rawQuartos ?? 0);

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
        }
    }

    // Continua buscando recursivamente em propriedades aninhadas
    for (const value of Object.values(record)) {
        if (value && typeof value === "object") {
            extractHousesFromJSON(value, map, isComprar);
        }
    }
}

/**
 * Fallback robusto: extrai dados diretamente do DOM da página.
 * Procura links para imóveis e textos com preços/áreas.
 */
async function extractFromDOM(
    page: import("playwright").Page,
    isComprar: boolean
): Promise<Imovel[]> {
    return page.evaluate((isComprar: boolean) => {
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

        const seen = new Set<string>();

        // ─── Estratégia 1: Procurar todos os links para /imovel/ ───
        const allLinks = document.querySelectorAll('a[href*="/imovel/"]');
        allLinks.forEach((anchor) => {
            try {
                const href = (anchor as HTMLAnchorElement).href || "";
                const idMatch = href.match(/imovel\/([a-zA-Z0-9_-]+)/);
                if (!idMatch) return;

                const id = idMatch[1];
                if (seen.has(id)) return;
                seen.add(id);

                // Pega o card pai (sobe na árvore até achar um container relevante)
                const card =
                    anchor.closest('[class*="card"]') ||
                    anchor.closest('[class*="Card"]') ||
                    anchor.closest('[class*="listing"]') ||
                    anchor.closest('[class*="Listing"]') ||
                    anchor.closest('[class*="house"]') ||
                    anchor.closest('[class*="House"]') ||
                    anchor.closest('[role="listitem"]') ||
                    anchor.closest("li") ||
                    anchor.closest("article") ||
                    anchor;

                const text = card?.textContent || "";

                // Extrai preço — procura padrões como "R$ 150.000" ou "R$ 3.500"
                const pricePatterns = text.match(
                    /R\$\s*([\d.]+(?:,\d{2})?)/g
                );
                let price = 0;
                if (pricePatterns && pricePatterns.length > 0) {
                    // Pega o primeiro preço encontrado (geralmente o principal)
                    const mainPrice = pricePatterns[0]
                        .replace(/[R$\s]/g, "")
                        .replace(/\./g, "")
                        .replace(",", ".");
                    price = parseFloat(mainPrice) || 0;
                }

                // Extrai área
                const areaMatch = text.match(/(\d+)\s*m²/);
                const area = areaMatch ? parseInt(areaMatch[1]) : 0;

                // Extrai quartos
                const quartoMatch =
                    text.match(/(\d+)\s*quarto/i) ||
                    text.match(/(\d+)\s*dorm/i) ||
                    text.match(/(\d+)\s*qto/i);
                const quartos = quartoMatch ? parseInt(quartoMatch[1]) : 0;

                // Extrai bairro (texto antes de vírgulas, ou partes curtas do texto)
                let bairro = "";
                const addressEl = card?.querySelector(
                    '[class*="address"], [class*="Address"], [class*="neighborhood"], [class*="Neighborhood"], [class*="location"], [class*="Location"], [class*="region"], [class*="Region"]'
                );
                if (addressEl) {
                    bairro = addressEl.textContent?.trim() || "";
                }

                if (price > 0 || area > 0) {
                    results.push({
                        id,
                        bairro,
                        areaMt2: area,
                        precoTotal: price,
                        precoPorMt2:
                            area > 0 && price > 0
                                ? Math.round((price / area) * 100) / 100
                                : 0,
                        link: href,
                        quartos,
                        tipo: "Imóvel",
                    });
                }
            } catch {
                // Ignora erros de elementos individuais
            }
        });

        // ─── Estratégia 2: Procurar dados em __NEXT_DATA__ ─────────
        try {
            const nextDataScript = document.getElementById("__NEXT_DATA__");
            if (nextDataScript) {
                const nextData = JSON.parse(nextDataScript.textContent || "{}");
                // Percorre o JSON do Next.js procurando dados de imóveis
                const queue: unknown[] = [nextData];
                while (queue.length > 0 && results.length < 200) {
                    const current = queue.shift();
                    if (!current || typeof current !== "object") continue;

                    if (Array.isArray(current)) {
                        for (const item of current) queue.push(item);
                        continue;
                    }

                    const rec = current as Record<string, unknown>;
                    const recId =
                        rec.id || rec.houseId || rec.listingId || rec.propertyId;
                    const recPrice =
                        rec.salePrice ??
                        rec.price ??
                        rec.totalCost ??
                        rec.rent ??
                        rec.sellingPrice ??
                        rec.listingPrice;

                    if (recId && recPrice !== undefined) {
                        const id = String(recId);
                        if (!seen.has(id)) {
                            seen.add(id);
                            const p =
                                typeof recPrice === "number"
                                    ? recPrice
                                    : parseFloat(
                                        String(recPrice)
                                            .replace(/[R$\s.]/g, "")
                                            .replace(",", ".")
                                    ) || 0;
                            const a = Number(
                                rec.area ?? rec.usableArea ?? rec.totalArea ?? 0
                            );
                            const b = String(
                                rec.neighbourhood ??
                                rec.neighborhood ??
                                rec.bairro ??
                                rec.regionName ??
                                ""
                            );
                            const q = Number(rec.bedrooms ?? rec.dorms ?? rec.quartos ?? 0);
                            if (p > 0) {
                                results.push({
                                    id,
                                    bairro: b,
                                    areaMt2: a,
                                    precoTotal: p,
                                    precoPorMt2:
                                        a > 0 ? Math.round((p / a) * 100) / 100 : 0,
                                    link: `https://www.quintoandar.com.br/imovel/${id}`,
                                    quartos: q,
                                    tipo: "Imóvel",
                                });
                            }
                        }
                    }

                    for (const val of Object.values(rec)) {
                        if (val && typeof val === "object") queue.push(val);
                    }
                }
            }
        } catch {
            // __NEXT_DATA__ não disponível ou inválido
        }

        return results;
    }, isComprar);
}
