"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";

export type UrlRow = {
  section: string;
  url: string;
  isSectionHeader: boolean;
  urlCount?: number;
  subRows?: UrlRow[];
};

function getPathnameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname || "/";
  } catch {
    const match = url.match(/https?:\/\/[^\/]+(\/.*)?$/);
    return match ? (match[1] || "/") : url;
  }
}

export const columns: ColumnDef<UrlRow>[] = [
  {
    id: "select",
    header: "",
    cell: ({ row }) => {
      const isSectionHeader = row.original.isSectionHeader;
      
      if (isSectionHeader) {
        const subRows = row.getLeafRows();
        const selectedSubRows = subRows.filter((subRow) => subRow.getIsSelected());
        const allSelected = subRows.length > 0 && selectedSubRows.length === subRows.length;
        const someSelected = selectedSubRows.length > 0 && selectedSubRows.length < subRows.length;

        return (
          <div className="flex justify-start pr-2">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onCheckedChange={(checked) => {
                subRows.forEach((subRow) => {
                  subRow.toggleSelected(!!checked);
                });
              }}
              aria-label="Select all in section"
            />
          </div>
        );
      }

      return (
        <div className="flex justify-start pr-2">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => {
              row.toggleSelected(!!checked);
            }}
            aria-label="Select row"
          />
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "section",
    header: "Section",
    cell: ({ row }) => {
      const isSectionHeader = row.original.isSectionHeader;
      const section = row.original.section;
      const urlCount = row.original.urlCount || 0;
      const depth = row.depth;

      if (isSectionHeader) {
        return (
          <div className="font-medium text-accent">
            {section === "/" ? "Root" : section}
            {urlCount > 1 && (
              <span className="ml-2 text-accent font-normal">
                ({urlCount})
              </span>
            )}
          </div>
        );
      }

      const displayPath = getPathnameFromUrl(row.original.url);

      return (
        <div className={depth > 0 ? "pl-8" : ""}>
          <a
            href={row.original.url}
            className="text-accent hover:underline underline-offset-4 break-all"
            target="_blank"
            rel="noreferrer"
          >
            {displayPath}
          </a>
        </div>
      );
    },
  },
];


