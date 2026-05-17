import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "relative mt-0.5 h-6 w-11 cursor-pointer rounded-full bg-neutral-300 transition-colors duration-150 hover:bg-neutral-400 data-[checked]:bg-chemd-foreground dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:data-[checked]:bg-chemd-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
    {...props}
  >
    {children ?? <SwitchThumb />}
  </SwitchPrimitive.Root>
))
Switch.displayName = "Switch"

const SwitchThumb = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Thumb>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Thumb>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Thumb
    ref={ref}
    className={cn(
      "absolute left-1 top-1 size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.18)] transition-transform duration-150 data-[checked]:translate-x-5 dark:bg-foreground dark:shadow-[0_1px_2px_rgba(0,0,0,0.38)]",
      className
    )}
    {...props}
  />
))
SwitchThumb.displayName = "SwitchThumb"

export { Switch, SwitchThumb }
