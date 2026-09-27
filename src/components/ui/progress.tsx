"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

function Progress({
  className,
  value,
  indicatorColor,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  /** Any CSS colour (e.g. a subject colour). Defaults to the primary colour. */
  indicatorColor?: string
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full bg-primary transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value || 0))}%`, ...(indicatorColor ? { background: indicatorColor } : null) }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
