import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const surfaceVariants = cva("", {
  variants: {
    variant: {
      control:
        "select-none rounded-lg border border-white/35 bg-transparent transition-colors duration-150 hover:border-foreground/35 hover:bg-white/22 data-[active=true]:border-foreground/35 data-[active=true]:bg-white/22",
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
