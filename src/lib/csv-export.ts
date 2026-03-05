import type { Imovel } from "./mock-data";

export function exportToCSV(data: Imovel[], filename = "imoveis-quintoandar.csv") {
  const headers = ["ID", "Bairro", "Tipo", "Quartos", "Área (m²)", "Preço Total (R$)", "Preço/m² (R$)", "Link"];
  const rows = data.map((item) => [
    item.id,
    item.bairro,
    item.tipo,
    item.quartos,
    item.areaMt2,
    item.precoTotal,
    item.precoPorMt2,
    item.link,
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
