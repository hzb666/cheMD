import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "h-8 min-w-0 rounded-md border border-slate-300/75 bg-white/80 px-2 text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition hover:border-slate-400 hover:bg-white focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60",
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
