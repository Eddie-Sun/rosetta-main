"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  ExpandedState,
  getExpandedRowModel,
  RowSelectionState,
} from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { UrlRow } from "./columns";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function DataTable<TData extends UrlRow, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const table = useReactTable({
    data,
    columns,
    state: {
      expanded,
      rowSelection,
    },
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) => !row.original.isSectionHeader,
    getRowCanExpand: (row) => {
      return Boolean(row.original.isSectionHeader && row.original.subRows && row.original.subRows.length > 0);
    },
    getSubRows: (row) => row.subRows as TData[] | undefined,
    getExpandedRowModel: getExpandedRowModel(),
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const isExpanded = row.getIsExpanded();
              const canExpand = row.getCanExpand();

              return (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() && "selected"}
                    className={canExpand ? "cursor-pointer hover:bg-muted/50" : ""}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('[role="checkbox"]') || target.closest('[aria-label*="Select"]')) {
                        return;
                      }
                      if (canExpand) {
                        row.toggleExpanded();
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isSectionColumn = cell.column.id === "section";
                      const isSelectColumn = cell.column.id === "select";

                      return (
                        <TableCell
                          key={cell.id}
                          className={`py-2 ${isSelectColumn ? "pr-2 w-0" : isSectionColumn ? "pl-0" : ""}`}
                          onClick={(e) => {
                            if (isSelectColumn) {
                              e.stopPropagation();
                            }
                          }}
                        >
                          {isSectionColumn ? (
                            <div className="flex items-center gap-2">
                              {canExpand && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    row.toggleExpanded();
                                  }}
                                >
                                  <ChevronRight
                                    className={`h-4 w-4 text-accent transition-transform ${isExpanded ? "rotate-90" : ""
                                      }`}
                                  />
                                </Button>
                              )}
                              {!canExpand && <div className="w-4" />}
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </div>
                          ) : (
                            flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </React.Fragment>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                <div className="text-muted-foreground">No suggestions yet.</div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}


