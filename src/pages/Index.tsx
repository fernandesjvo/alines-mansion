import { useState, useCallback } from "react";
import { Search, Download, AlertTriangle, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PropertyTable } from "@/components/PropertyTable";
import { StatsCards } from "@/components/StatsCards";
import { generateMockData, type Imovel } from "@/lib/mock-data";
import { exportToCSV } from "@/lib/csv-export";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [url, setUrl] = useState("");
  const [data, setData] = useState<Imovel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filter, setFilter] = useState("");
  const { toast } = useToast();

  const handleAnalyze = useCallback(() => {
    if (!url.includes("quintoandar")) {
      toast({
        title: "URL inválida",
        description: "Cole uma URL de busca válida do QuintoAndar.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setSearched(false);
    // Simulates API intercept delay
    setTimeout(() => {
      const mockResults = generateMockData(40);
      setData(mockResults);
      setLoading(false);
      setSearched(true);
      toast({
        title: `${mockResults.length} imóveis encontrados`,
        description: "Dados extraídos via interceptação GraphQL (demo).",
      });
    }, 2200);
  }, [url, toast]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-7xl mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold font-mono tracking-tight">
              <span className="text-primary">QA</span>
              <span className="text-muted-foreground">_scraper</span>
            </h1>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-2 py-0.5">
            v1.0 · DEMO
          </span>
        </div>
      </header>

      <main className="container max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* URL Input */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <AlertTriangle className="h-3 w-3 text-warning" />
            Interceptação de rede · Endpoint GraphQL listHouses
          </div>
          <div className="flex gap-3">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.quintoandar.com.br/alugar/imovel/sao-paulo-sp-brasil..."
              className="flex-1 font-mono text-sm bg-background border-border placeholder:text-muted-foreground/50"
            />
            <Button onClick={handleAnalyze} disabled={loading || !url} className="gap-2 font-mono">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Extraindo..." : "Analisar"}
            </Button>
          </div>
        </div>

        {/* Results */}
        {searched && data.length > 0 && (
          <>
            <StatsCards data={data} />

            <div className="flex items-center justify-between">
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar por bairro, tipo..."
                className="max-w-xs font-mono text-sm bg-background border-border placeholder:text-muted-foreground/50"
              />
              <Button
                variant="outline"
                onClick={() => exportToCSV(data)}
                className="gap-2 font-mono text-sm"
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>

            <PropertyTable data={data} globalFilter={filter} />

            <p className="text-[10px] text-muted-foreground font-mono text-center">
              ★ = Preço/m² 15% abaixo da média · Dados de demonstração
            </p>
          </>
        )}

        {!searched && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
            <div className="h-16 w-16 rounded-full border border-border flex items-center justify-center">
              <Search className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-muted-foreground font-medium">Cole uma URL do QuintoAndar acima</p>
              <p className="text-xs text-muted-foreground/60 font-mono mt-1">
                Os dados serão extraídos via interceptação da API GraphQL
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
