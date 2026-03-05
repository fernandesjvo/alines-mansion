import type { Imovel } from "./types.js";

/**
 * Gera uma string CSV a partir de um array de imóveis.
 * Inclui BOM UTF-8 para compatibilidade com Excel.
 */
export function generateCSV(imoveis: Imovel[]): string {
    const BOM = "\uFEFF";
    const headers = [
        "ID",
        "Bairro",
        "Tipo",
        "Quartos",
        "Área (m²)",
        "Preço Total (R$)",
        "Preço/m² (R$)",
        "Link",
    ];

    const rows = imoveis.map((item) => [
        item.id,
        item.bairro,
        item.tipo,
        String(item.quartos),
        String(item.areaMt2),
        String(item.precoTotal),
        String(item.precoPorMt2),
        item.link,
    ]);

    const csvContent = [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
        .join("\n");

    return BOM + csvContent;
}
