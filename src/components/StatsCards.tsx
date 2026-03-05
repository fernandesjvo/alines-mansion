import { useMemo } from "react";
import { Building2, DollarSign, Ruler, TrendingDown } from "lucide-react";
import type { Imovel } from "@/lib/mock-data";

interface StatsCardsProps {
  data: Imovel[];
}

export function StatsCards({ data }: StatsCardsProps) {
  const stats = useMemo(() => {
    if (!data.length) return null;
    const avgPrice = data.reduce((s, d) => s + d.precoTotal, 0) / data.length;
    const avgArea = data.reduce((s, d) => s + d.areaMt2, 0) / data.length;
    const avgPriceM2 = data.reduce((s, d) => s + d.precoPorMt2, 0) / data.length;
    const bestDeal = data.reduce((min, d) => (d.precoPorMt2 < min.precoPorMt2 ? d : min), data[0]);
    return { total: data.length, avgPrice, avgArea, avgPriceM2, bestDeal };
  }, [data]);

  if (!stats) return null;

  const cards = [
    {
      label: "Imóveis",
      value: stats.total.toString(),
      icon: Building2,
      color: "text-primary",
    },
    {
      label: "Preço Médio",
      value: `R$ ${Math.round(stats.avgPrice).toLocaleString("pt-BR")}`,
      icon: DollarSign,
      color: "text-foreground",
    },
    {
      label: "Área Média",
      value: `${Math.round(stats.avgArea)} m²`,
      icon: Ruler,
      color: "text-foreground",
    },
    {
      label: "Melhor R$/m²",
      value: `R$ ${stats.bestDeal.precoPorMt2.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      sub: stats.bestDeal.bairro,
      icon: TrendingDown,
      color: "text-accent",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{card.label}</span>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </div>
          <p className={`font-mono text-xl font-bold ${card.color}`}>{card.value}</p>
          {card.sub && <p className="text-xs text-muted-foreground">{card.sub}</p>}
        </div>
      ))}
    </div>
  );
}
