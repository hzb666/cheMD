import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        surface:
          "border-white/45 bg-white/35 text-foreground hover:bg-white/55 focus-visible:ring-2 focus-visible:ring-ring/40 active:not-aria-[haspopup]:translate-y-0",
        chrome:
          "text-muted-foreground hover:bg-white/35 hover:text-foreground data-[state=open]:bg-white/85 data-[state=open]:text-foreground data-[state=open]:shadow-sm active:not-aria-[haspopup]:translate-y-0",
        rail:
          "text-muted-foreground hover:bg-white/45 hover:text-foreground hover:shadow-sm aria-pressed:bg-white/65 aria-pressed:text-foreground data-[state=open]:bg-white/65 data-[state=open]:text-foreground data-[state=open]:shadow-sm active:not-aria-[haspopup]:translate-y-0",
        window:
          "text-muted-foreground hover:bg-white/45 hover:text-foreground hover:shadow-sm data-[maximized=true]:text-foreground data-[control=close]:hover:bg-destructive data-[control=close]:hover:text-white data-[control=close]:hover:shadow-none data-[control=close]:active:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-primary/25 data-[control=close]:focus-visible:ring-destructive/35 active:not-aria-[haspopup]:translate-y-0",
        settingsItem:
          "!grid !border-0 text-left hover:bg-slate-900/[0.04] data-[active=true]:bg-chemd-background active:not-aria-[haspopup]:translate-y-0",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        control: "h-8 gap-1.5 rounded-md px-2 text-xs",
        settingsItem: "!h-auto !w-full grid-cols-[1.5rem_1fr] gap-2 px-2 py-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "window-icon": "size-8 rounded-[min(var(--radius-sm),7px)]",
        "icon-lg": "size-9",
        "icon-xl": "size-10 rounded-[min(var(--radius-md),10px)] [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
