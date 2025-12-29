import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SectionCardItem = {
  title: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  href?: string;
};

export function SectionCards({
  items,
  className,
}: {
  items: SectionCardItem[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 px-4 lg:px-6 md:grid-cols-2 lg:grid-cols-4", className)}>
      {items.map((item) => {
        const content = (
          <Card key={item.title} className="card--stat">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] text-muted-foreground">{item.title}</div>
            </div>
            <div className="mt-2 text-[22px] leading-tight font-semibold tracking-tight">
              {item.value}
            </div>
            {item.description ? (
              <div className="mt-2 text-[13px] text-muted-foreground">{item.description}</div>
            ) : null}
          </Card>
        );

        if (item.href) {
          return (
            <Link key={item.title} href={item.href} className="block">
              {content}
            </Link>
          );
        }

        return content;
      })}
    </div>
  );
}






