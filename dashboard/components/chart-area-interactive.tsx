import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ChartItem = { label: string; value: number };

export function ChartAreaInteractive({
  title = "Chart",
  description,
  items,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  items: ChartItem[];
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <Card className={cn("card--large", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[16px] font-semibold">{title}</div>
          {description ? (
            <div className="mt-2 text-[14px] text-muted-foreground">{description}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-2">
        {items.length === 0 ? (
          <div className="text-[14px] text-muted-foreground">No data yet.</div>
        ) : (
          items.map((item) => {
            const pct = Math.round((item.value / max) * 100);
            return (
              <div key={item.label} className="grid grid-cols-[120px_1fr_64px] items-center gap-3">
                <div className="truncate text-[13px] text-muted-foreground">{item.label}</div>
                <div className="h-2 border border-border bg-background">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${pct}%` }}
                    aria-hidden="true"
                  />
                </div>
                <div className="text-right text-[13px] text-muted-foreground tabular-nums">
                  {item.value}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}


