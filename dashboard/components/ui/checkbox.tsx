import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    checked?: boolean
    indeterminate?: boolean
    onCheckedChange?: (checked: boolean) => void
  }
>(({ className, checked, indeterminate, onCheckedChange, ...props }, ref) => {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      ref={ref}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-input ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=checked]:text-background",
        (checked || indeterminate) && "bg-foreground text-background",
        className
      )}
      data-state={indeterminate ? "indeterminate" : checked ? "checked" : "unchecked"}
      onClick={(e) => {
        e.stopPropagation();
        onCheckedChange?.(!checked);
      }}
      {...props}
    >
      {indeterminate ? (
        <div className="h-0.5 w-2 bg-background" />
      ) : checked ? (
        <Check className="h-3 w-3" />
      ) : null}
    </button>
  )
})
Checkbox.displayName = "Checkbox"

export { Checkbox }

