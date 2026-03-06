import { useState, useCallback } from "react";
import { Search, Download, AlertTriangle, Loader2, Zap, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PropertyTable } from "@/components/PropertyTable";
import { StatsCards } from "@/components/StatsCards";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { Imovel } from "@/lib/mock-data";
import { exportToCSV } from "@/lib/csv-export";
import { scrapeUrl, downloadCSVFromServer, listenToProgress, checkAvailability, type ScrapeProgressEvent } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [url, setUrl] = useState("");
  const [data, setData] = useState<Imovel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filter, setFilter] = useState("");
  const [deepScan, setDeepScan] = useState(false);
  const [progressState, setProgressState] = useState<ScrapeProgressEvent | null>(null);
  const { toast } = useToast();

  const isProd = import.meta.env.PROD;

  const handleAnalyze = useCallback(async () => {
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
    setProgressState({ percent: 0, message: "Conectando ao servidor...", step: "init" });

    const jobId = crypto.randomUUID();

    // Inicia a escuta de eventos SSE antes de disparar a requisição de scrape
    const closeSSE = listenToProgress(jobId, (event) => {
      setProgressState(event);
    });

    try {
      const maxScrolls = deepScan ? 50 : 4;
      const result = await scrapeUrl(url, maxScrolls, jobId);

      if (result.success && result.imoveis.length > 0) {
        setData(result.imoveis);
        setSearched(true);
        toast({
          title: `${result.count} imóveis encontrados`,
          description: `Dados extraídos via interceptação GraphQL em ${new Date(result.scrapedAt).toLocaleTimeString("pt-BR")}.`,
        });
      } else {
        toast({
          title: "Nenhum imóvel encontrado",
          description: result.error || "Tente outra URL ou verifique se o site está acessível.",
          variant: "destructive",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      toast({
        title: "Erro no scraping",
        description: message,
        variant: "destructive",
      });
      setProgressState((prev) => prev ? { ...prev, percent: 100, message: "Erro na extração", step: "error" } : null);
    } finally {
      setLoading(false);
      closeSSE(); // Fecha a conexão SSE
    }
  }, [url, toast, deepScan]);

  const handleCheckAvailability = useCallback(async () => {
    if (data.length === 0) return;

    setLoading(true);
    setProgressState({ percent: 0, message: "Conectando ao servidor...", step: "init" });

    const jobId = crypto.randomUUID();

    const closeSSE = listenToProgress(jobId, (event) => {
      setProgressState(event);
    });

    try {
      // Extrai os links dos imóveis atualmente na tela (respeitando filtro de busca se houver)
      const currentData = filter
        ? data.filter((item) =>
          Object.values(item).some((val) =>
            String(val).toLowerCase().includes(filter.toLowerCase())
          )
        )
        : data;

      const urls = currentData.map(i => i.link);
      const res = await checkAvailability(urls, jobId);

      if (res.success && res.results) {
        // Mantém apenas os imóveis que estão marcados como isAvailable = true
        const availableData = data.filter(item => {
          // Se o item estava na verificação, olha no resultado. 
          // Se não estava (ex: filtrado fora), mantém.
          if (res.results[item.link] !== undefined) {
            return res.results[item.link] === true;
          }
          return true;
        });

        const removedCount = data.length - availableData.length;
        setData(availableData);

        toast({
          title: "Verificação Concluída",
          description: removedCount > 0
            ? `${removedCount} imóveis indisponíveis foram removidos da lista.`
            : `Todos os imóveis verificados estão disponíveis!`,
        });
      }
    } catch (error) {
      toast({
        title: "Erro na verificação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      setProgressState((prev) => prev ? { ...prev, percent: 100, message: "Erro na verificação", step: "error" } : null);
    } finally {
      setLoading(false);
      closeSSE();
    }
  }, [data, filter, toast]);

  const handleExportCSV = useCallback(async () => {
    // Aplica o filtro de tela aos dados antes de exportar
    const filteredData = filter
      ? data.filter((item) =>
        Object.values(item).some((val) =>
          String(val).toLowerCase().includes(filter.toLowerCase())
        )
      )
      : data;

    try {
      // Tenta exportar via backend primeiro
      await downloadCSVFromServer(filteredData);
    } catch {
      // Fallback: exporta no client-side
      exportToCSV(filteredData);
    }
  }, [data, filter]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-7xl mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold font-mono tracking-tight">
              <span className="text-primary">Aline's</span>
              <span className="text-muted-foreground"> Mansion</span>
            </h1>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-2 py-0.5">
            v2.0 · LIVE
          </span>
        </div>
      </header>

      <main className="container max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* URL Input */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <AlertTriangle className="h-3 w-3 text-warning" />
            Interceptação de rede · Endpoint GraphQL listHouses · Playwright + Stealth
          </div>
          <div className="flex gap-3">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.quintoandar.com.br/alugar/imovel/sao-paulo-sp-brasil..."
              className="flex-1 font-mono text-sm bg-background border-border placeholder:text-muted-foreground/50"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading && url) handleAnalyze();
              }}
            />
            <Button onClick={handleAnalyze} disabled={loading || !url} className="gap-2 font-mono">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Extraindo..." : "Analisar"}
            </Button>
          </div>
          {loading && progressState && (
            <div className="space-y-2 mt-4">
              <div className="flex justify-between text-xs font-mono text-muted-foreground">
                <span>{progressState.message}</span>
                <span>{progressState.percent}%</span>
              </div>
              <Progress value={progressState.percent} className="h-2" />
              {deepScan && progressState.step === "scrolling" && (
                <div className="text-[10px] text-muted-foreground/70 font-mono text-right">
                  Imóveis coletados até agora: {progressState.data?.collected || 0}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center space-x-2 pt-2 border-t border-border mt-4">
            <Switch
              id="deep-scan"
              checked={deepScan}
              onCheckedChange={setDeepScan}
              disabled={isProd || loading}
            />
            <Label htmlFor="deep-scan" className="text-sm font-mono flex items-center gap-2 cursor-pointer">
              Busca Profunda (Extrair todos)
              {isProd && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 bg-muted px-2 py-0.5 rounded">
                  <Info className="h-3 w-3" />
                  Apenas rodando localmente
                </span>
              )}
            </Label>
          </div>
        </div>

        {/* Results */}
        {searched && data.length > 0 && (
          <>
            <StatsCards data={data} />

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end justify-between mb-2">
              <div className="space-y-3 w-full sm:w-auto">
                <h2 className="text-xl font-bold font-mono tracking-tight flex items-center gap-2">
                  Resultados da Extração
                  <span className="text-sm font-normal text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    {data.length}
                  </span>
                </h2>
                <Input
                  placeholder="Filtrar por endereço, tipo, ID..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="max-w-[300px] font-mono text-sm"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button variant="outline" onClick={handleCheckAvailability} className="gap-2 font-mono text-sm" disabled={loading} title="Verificar Disponibilidade">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {loading ? "Atualizando..." : "Atualizar disponibilidade"}
                </Button>
                <Button variant="outline" onClick={handleExportCSV} className="gap-2 font-mono" disabled={loading}>
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </Button>
              </div>
            </div>

            <PropertyTable data={data} globalFilter={filter} />

            <p className="text-[10px] text-muted-foreground font-mono text-center">
              ★ = Preço/m² 15% abaixo da média · Dados reais via Playwright
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
                Os dados serão extraídos via interceptação da API GraphQL com Playwright
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
