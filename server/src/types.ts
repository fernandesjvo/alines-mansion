/** Imóvel extraído do QuintoAndar */
export interface Imovel {
    id: string;
    bairro: string;
    areaMt2: number;
    precoTotal: number;
    precoPorMt2: number;
    link: string;
    quartos: number;
    tipo: string;
}

/** Corpo da requisição POST /api/scrape */
export interface ScrapeRequest {
    url: string;
    maxScrolls?: number;
}

/** Resposta da requisição POST /api/scrape */
export interface ScrapeResponse {
    success: boolean;
    count: number;
    imoveis: Imovel[];
    scrapedAt: string;
    error?: string;
}
