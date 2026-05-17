import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const surfaceVariants = cva("", {
  variants: {
    variant: {
      control:
        "select-none rounded-lg border border-transparent bg-transparent transition-colors duration-150 hover:border-border/35 hover:bg-foreground/[0.04] data-[active=true]:border-border/45 data-[active=true]:bg-foreground/[0.05] dark:hover:bg-foreground/[0.055] dark:data-[active=true]:bg-foreground/[0.065]",
    },
  },
  defaultVariants: {
    variant: "control",
  },
})

function Surface({
  className,
  variant = "control",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof surfaceVariants>) {
  return (
    <div
      data-slot="surface"
      className={cn(surfaceVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Surface, surfaceVariants }
