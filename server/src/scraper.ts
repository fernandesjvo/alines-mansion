import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Imovel, ScrapeProgressEvent } from "./types.js";

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

interface UrlFilters {
    areaMin?: number;
    areaMax?: number;
    priceMin?: number;
    priceMax?: number;
    bedroomsMin?: number;
    bedroomsMax?: number;
}

/**
 * Parseia os filtros diretamente da URL do QuintoAndar.
 * Exemplos de segmentos:
 *   de-33-a-108-m2          → area 33..108
 *   de-150000-a-400000-venda → preço venda 150k..400k
 *   de-1500-a-4000-aluguel   → preço aluguel 1500..4000
 *   de-1-a-3-quartos         → quartos 1..3
 */
function parseUrlFilters(url: string): UrlFilters {
    const filters: UrlFilters = {};
    const segments = decodeURIComponent(url).split('/');

    for (const seg of segments) {
        // Área: de-33-a-108-m2
        const areaMatch = seg.match(/^de-(\d+)-a-(\d+)-m2$/i);
        if (areaMatch) {
            filters.areaMin = parseInt(areaMatch[1]);
            filters.areaMax = parseInt(areaMatch[2]);
            continue;
        }
        // Preço de venda: de-150000-a-400000-venda
        const vendaMatch = seg.match(/^de-(\d+)-a-(\d+)-venda$/i);
        if (vendaMatch) {
            filters.priceMin = parseInt(vendaMatch[1]);
            filters.priceMax = parseInt(vendaMatch[2]);
            continue;
        }
        // Preço de aluguel: de-1500-a-4000-aluguel
        const aluguelMatch = seg.match(/^de-(\d+)-a-(\d+)-aluguel$/i);
        if (aluguelMatch) {
            filters.priceMin = parseInt(aluguelMatch[1]);
            filters.priceMax = parseInt(aluguelMatch[2]);
            continue;
        }
        // Quartos: de-1-a-3-quartos
        const quartosMatch = seg.match(/^de-(\d+)-a-(\d+)-quartos$/i);
        if (quartosMatch) {
            filters.bedroomsMin = parseInt(quartosMatch[1]);
            filters.bedroomsMax = parseInt(quartosMatch[2]);
            continue;
        }
    }

    return filters;
}

/**
 * Aplica filtros rígidos nos resultados extraídos.
 * Remove qualquer imóvel que viole os filtros da URL do usuário.
 */
function applyUrlFilters(houses: Imovel[], filters: UrlFilters): Imovel[] {
    return houses.filter(h => {
        // Só filtra se temos o dado (> 0) E o filtro está definido
        if (filters.areaMin !== undefined && h.areaMt2 > 0 && h.areaMt2 < filters.areaMin) return false;
        if (filters.areaMax !== undefined && h.areaMt2 > 0 && h.areaMt2 > filters.areaMax) return false;
        if (filters.priceMin !== undefined && h.precoTotal > 0 && h.precoTotal < filters.priceMin) return false;
        if (filters.priceMax !== undefined && h.precoTotal > 0 && h.precoTotal > filters.priceMax) return false;
        if (filters.bedroomsMin !== undefined && h.quartos > 0 && h.quartos < filters.bedroomsMin) return false;
        if (filters.bedroomsMax !== undefined && h.quartos > 0 && h.quartos > filters.bedroomsMax) return false;
        return true;
    });
}

/**
 * Realiza o scraping de uma URL do QuintoAndar.
 */
export async function scrapeQuintoAndar(
    url: string,
    maxScrolls: number = 4,
    onProgress?: (event: ScrapeProgressEvent) => void
): Promise<Imovel[]> {
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    // Dicionário de metadados perfeitos vindos da rede
    const metadataCache: Map<string, Imovel> = new Map();
    const isComprar = url.includes("comprar");

    const reportProgress = (percent: number, step: ScrapeProgressEvent["step"], message: string, data?: any) => {
        if (onProgress) onProgress({ percent, step, message, data });
    };

    reportProgress(5, "init", "Iniciando scraper híbrido...", { url, maxScrolls, isComprar });

    console.log(`[scraper] Iniciando scraping híbrido: ${url}`);
    console.log(`[scraper] Modo: ${isComprar ? "COMPRA" : "ALUGUEL"}`);

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

        // ─── 1. Interceptação de Rede (Apenas Cadastro de Metadados) ───
        page.on("response", async (response) => {
            try {
                const status = response.status();
                if (status < 200 || status >= 400) return;

                const contentType = response.headers()["content-type"] || "";
                if (!contentType.includes("json")) return;

                const reqUrl = response.url();

                // Ignora assets, analytics, imagens, etc
                if (
                    reqUrl.includes("analytics") || reqUrl.includes("tracking") ||
                    reqUrl.includes("pixel") || reqUrl.includes("gtm") ||
                    reqUrl.includes("google") || reqUrl.includes("facebook") ||
                    reqUrl.includes("hotjar") || reqUrl.includes("sentry") ||
                    reqUrl.includes(".png") || reqUrl.includes(".jpg") ||
                    reqUrl.includes(".svg")
                ) {
                    return;
                }

                const body = await response.json().catch(() => null);
                if (!body) return;

                const sizeBefore = metadataCache.size;
                // Popula o dicionário, mas NÃO significa que esses imóveis serão exportados
                extractHousesFromJSON(body, metadataCache, isComprar);
                const sizeAfter = metadataCache.size;

                capturedResponses++;
                if (sizeAfter > sizeBefore) {
                    console.log(`[scraper] ✓ Cache de metadados cresceu em ${sizeAfter - sizeBefore} itens via rede.`);
                }
            } catch {
                // Ignora erros de respostas individuais
            }
        });

        // ─── 2. Navegação ─────────────────────────────────────────────
        console.log("[scraper] Navegando para a página...");
        reportProgress(10, "navigating", "Navegando para a página do QuintoAndar...");
        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });

        await humanDelay(2500, 4000);

        // ─── 3. Scroll para carregar mais imóveis visíveis ───────────
        const SCROLL_COUNT = maxScrolls;
        console.log(`[scraper] Iniciando ${SCROLL_COUNT} scrolls...`);
        reportProgress(20, "scrolling", `Iniciando rolagens na página (0/${SCROLL_COUNT})`, { totalScrolls: SCROLL_COUNT });

        for (let i = 0; i < SCROLL_COUNT; i++) {
            const progressPercent = 20 + Math.floor(((i + 1) / SCROLL_COUNT) * 60);
            reportProgress(
                progressPercent,
                "scrolling",
                `Carregando itens visíveis da página (${i + 1}/${SCROLL_COUNT})...\nCache: ${metadataCache.size} imóveis arquivados`,
                { currentScroll: i + 1, totalScrolls: SCROLL_COUNT, cacheSize: metadataCache.size }
            );

            // Scroll manual de 1000px por vez para forçar carregamento de imagens e cards nativos
            await page.evaluate(async () => {
                window.scrollBy({ top: 1200, behavior: "smooth" });
            });

            await humanDelay(1500, 2500);

            // Tenta clicar em botões de "carregar mais"
            try {
                const loadMoreSelectors = [
                    'button:has-text("Mostrar mais")',
                    'button:has-text("Carregar mais")',
                    'button:has-text("Ver mais")',
                    'button:has-text("Próxima página")',
                ];

                for (const selector of loadMoreSelectors) {
                    try {
                        const btn = page.locator(selector).first();
                        if (await btn.isVisible({ timeout: 500 })) {
                            await btn.click();
                            console.log(`[scraper] Clicou em carregar mais`);
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
        }

        console.log(`[scraper] Pós-scroll: ${capturedResponses} requests. Metadados cacheados: ${metadataCache.size}.`);

        // ─── 4. Extração Estrita do DOM (Respeitando Filtros Visuais) ───
        reportProgress(90, "extracting", "Cruzando cards visíveis com o Dicionário de Preços...", { cacheSize: metadataCache.size });
        console.log("[scraper] Extraindo imóveis estritamente dos cards visíveis do DOM...");

        const strictHouses = await extractFromDOM(page, isComprar, metadataCache);

        console.log(`[scraper] Extraídos ${strictHouses.length} imóveis visíveis.`);

        await context.close();

        // ─── 5. Aplicar Filtros Rígidos da URL ──────────────────────
        const filters = parseUrlFilters(url);
        const filteredHouses = applyUrlFilters(strictHouses, filters);
        const removed = strictHouses.length - filteredHouses.length;
        if (removed > 0) {
            console.log(`[scraper] ✂ Filtros da URL removeram ${removed} imóveis incompatíveis.`);
            console.log(`[scraper]   Filtros: area=${filters.areaMin}-${filters.areaMax}m², preço=${filters.priceMin}-${filters.priceMax}, quartos=${filters.bedroomsMin}-${filters.bedroomsMax}`);
        }
        console.log(`[scraper] Resultado final: ${filteredHouses.length} imóveis.`);

        return filteredHouses;
    } finally {
        await browser.close();
    }
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
 * Extração Estrita: extrai dados apenas dos imóveis listados VISUAMENTE no DOM (Strategy 1).
 * Para cada card encontrado no HTML da tela, tenta recuperar seus metadados ricos e perfeitos pelo `metadataCache`.
 * Caso o cache não o tenha capturado, faz o fallback processando regex sobre o texto do card.
 */
async function extractFromDOM(
    page: import("playwright").Page,
    isComprar: boolean,
    metadataCache: Map<string, Imovel>
): Promise<Imovel[]> {
    // Para simplificar a transferência entre Node e Browser Context,
    // nós enviamos os pares [ID, Imovel] para o Browser e depois iteramos.
    const cacheEntries = Array.from(metadataCache.entries());

    return page.evaluate(({ isComprar, cacheEntries }) => {
        const cache = new Map(cacheEntries);
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

        // ─── Apenas Estratégia 1: Procurar todos os links visíveis para /imovel/ ───
        // Isso nos dá a segurança absoluta de que o imóvel foi RENDERIZADO na tela
        // (respeitando rigorosamente a contagem de filtros do QuintoAndar)
        const allLinks = document.querySelectorAll('a[href*="/imovel/"]');

        allLinks.forEach((anchor) => {
            try {
                const href = (anchor as HTMLAnchorElement).href || "";

                // O ID do imóvel no QuintoAndar é estritamente numérico (7 a 12 dígitos)
                // Isso previne a captura de links de SEO do footer (ex: /imovel/liberdade-sao-paulo-sp-brasil)
                const idMatch = href.match(/imovel\/(\d{7,12})/);
                if (!idMatch) return;

                const id = idMatch[1];
                if (seen.has(id)) return;
                seen.add(id);

                // --- 1. Tenta recuperar do Dicionário de Metadados Perfeitos (Cache) ---
                if (cache.has(id)) {
                    // Cache Hit: Dados 100% precisos. Array do Next/GraphQL
                    results.push(cache.get(id)!);
                    return; // Passa para o próximo link
                }

                // --- 2. Cache Miss: Fallback para Extração do Texto do DOM (Menos Preciso) ---
                let card =
                    anchor.closest('[data-testid="house-card"]') ||
                    anchor.closest('[class*="card"]') ||
                    anchor.closest('[class*="Card"]') ||
                    anchor.closest('[class*="listing"]') ||
                    anchor.closest('li') ||
                    anchor;

                // Proteção contra containers gigantescos (ex: selecionou a página/lista inteira)
                if (card && card.textContent && card.textContent.length > 1000) {
                    card = anchor.parentElement || anchor; // Reduz o escopo para evitar vazar pro Footer
                }

                const text = card?.textContent || "";

                // Extrai preço
                const pricePatterns = text.match(/R\$\s*([\d.]+(?:,\d{2})?)/g);
                let price = 0;
                if (pricePatterns && pricePatterns.length > 0) {
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

                // Extrai bairro — Fonte: URL do próprio link (100% livre de ruído do DOM)
                // Formato real: /imovel/ID/comprar/kitnet-1-quarto-bela-vista-sao-paulo?query_params
                let bairro = "";
                {
                    const cleanHref = href.split('?')[0];
                    const hrefParts = cleanHref.split('/');
                    const modeIdx = hrefParts.findIndex(p => p === 'comprar' || p === 'alugar');

                    if (modeIdx >= 0 && modeIdx + 1 < hrefParts.length) {
                        let slug = hrefParts[modeIdx + 1];

                        // Remove city suffix (sorted longest-first to avoid partial matches)
                        const cities = [
                            "sao-bernardo-do-campo", "sao-caetano-do-sul", "sao-jose-dos-campos",
                            "centro-historico-de-sao-paulo", "rio-de-janeiro", "belo-horizonte",
                            "porto-alegre", "novo-hamburgo", "taboao-da-serra", "santo-andre",
                            "praia-grande", "nova-lima", "caxias-do-sul", "sao-leopoldo",
                            "sao-paulo", "curitiba", "campinas", "brasilia", "goiania", "guarulhos",
                            "osasco", "niteroi", "salvador", "recife", "fortaleza", "florianopolis",
                            "vitoria", "barueri", "hortolandia", "ribeirao-preto", "diadema",
                            "jundiai", "sorocaba", "contagem", "betim", "canoas", "joinville",
                            "sao-jose", "santos"
                        ];
                        for (const c of cities) {
                            if (slug.endsWith('-' + c)) {
                                slug = slug.substring(0, slug.length - c.length - 1);
                                break;
                            }
                        }

                        // Remove room count patterns like "1-quarto", "2-quartos"
                        slug = slug.replace(/-?\d+-quartos?/i, '');

                        // Remove type prefix
                        const types = [
                            "apartamento", "casa", "studio", "loja", "sala-comercial", "kitnet",
                            "cobertura", "flat", "lote-terreno", "ponto-comercial", "fazenda-sitio-chacara"
                        ];
                        for (const t of types) {
                            if (slug.startsWith(t + '-')) { slug = slug.substring(t.length + 1); break; }
                            else if (slug === t) { slug = ''; break; }
                        }

                        // Clean up and Title Case
                        bairro = slug.replace(/^-+|-+$/g, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).trim();
                    }
                }

                if (bairro.length > 50) bairro = bairro.substring(0, 50).trim();

                if (price > 0 || area > 0) {
                    results.push({
                        id,
                        bairro,
                        areaMt2: area,
                        precoTotal: price,
                        precoPorMt2: area > 0 && price > 0 ? Math.round((price / area) * 100) / 100 : 0,
                        link: href,
                        quartos,
                        tipo: "Imóvel",
                    });
                }
            } catch {
                // Ignora erros de elementos individuais
            }
        });

        // NOTA: A antiga "Estratégia 2" (__NEXT_DATA__) foi EXTIRPADA permanentemente.
        // O `__NEXT_DATA__` estava poluindo os resultados com centenas de "imóveis recomendados"
        // e "marcações de mapa", quebrando os filtros de busca do usuário.

        return results;
    }, { isComprar, cacheEntries });
}
