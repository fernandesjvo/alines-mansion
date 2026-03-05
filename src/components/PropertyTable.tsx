import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpDown, ExternalLink } from "lucide-react";
import type { Imovel } from "@/lib/mock-data";

interface PropertyTableProps {
  data: Imovel[];
  globalFilter: string;
}

export function PropertyTable({ data, globalFilter }: PropertyTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const avgPricePerM2 = useMemo(() => {
    if (!data.length) return 0;
    return data.reduce((sum, d) => sum + d.precoPorMt2, 0) / data.length;
  }, [data]);

  const columns = useMemo<ColumnDef<Imovel>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "bairro",
        header: ({ column }) => (
          <button className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => column.toggleSorting()}>
            Bairro <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        cell: ({ getValue }) => (
          <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "quartos",
        header: ({ column }) => (
          <button className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => column.toggleSorting()}>
            Qtos <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        cell: ({ getValue }) => <span className="font-mono">{getValue<number>()}</span>,
      },
      {
        accessorKey: "areaMt2",
        header: ({ column }) => (
          <button className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => column.toggleSorting()}>
            Área (m²) <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        cell: ({ getValue }) => <span className="font-mono">{getValue<number>()}</span>,
      },
      {
        accessorKey: "precoTotal",
        header: ({ column }) => (
          <button className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => column.toggleSorting()}>
            Preço (R$) <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="font-mono font-semibold">
            {getValue<number>().toLocaleString("pt-BR")}
          </span>
        ),
      },
      {
        accessorKey: "precoPorMt2",
        header: ({ column }) => (
          <button className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => column.toggleSorting()}>
            R$/m² <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        cell: ({ row }) => {
          const val = row.original.precoPorMt2;
          const isGood = val < avgPricePerM2 * 0.85;
          return (
            <span className={`font-mono font-bold ${isGood ? "text-accent" : ""}`}>
              {val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              {isGood && <span className="ml-1 text-[10px]">★</span>}
            </span>
          );
        },
      },
      {
        accessorKey: "link",
        header: "Link",
        cell: ({ getValue }) => (
          <a
            href={getValue<string>()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
          >
            Ver <ExternalLink className="h-3 w-3" />
          </a>
        ),
      },
    ],
    [avgPricePerM2]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="border-border bg-secondary/50 hover:bg-secondary/50">
              {hg.headers.map((header) => (
                <TableHead key={header.id} className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="border-border hover:bg-secondary/30 transition-colors">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                Nenhum resultado encontrado.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
