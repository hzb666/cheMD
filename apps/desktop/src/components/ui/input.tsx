import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "h-8 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-foreground shadow-none outline-none transition hover:border-border/35 hover:bg-foreground/[0.055] focus-visible:border-border/55 focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-foreground/[0.07]",
  {
    variants: {
      size: {
        default: "text-sm",
        xs: "text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const Input = React.forwardRef<
  React.ElementRef<typeof InputPrimitive>,
  Omit<React.ComponentPropsWithoutRef<typeof InputPrimitive>, "size"> & {
    inputSize?: "default" | "xs"
  }
>(({ className, inputSize, ...props }, ref) => (
  <InputPrimitive
    ref={ref}
    className={cn(inputVariants({ size: inputSize }), className)}
    {...props}
  />
))
Input.displayName = "Input"

export { Input, inputVariants }
