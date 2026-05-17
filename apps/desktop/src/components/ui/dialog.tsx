import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogPortal = DialogPrimitive.Portal

type DialogTriggerProps = DialogPrimitive.Trigger.Props & {
  asChild?: boolean
}

const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ asChild, children, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return <DialogPrimitive.Trigger ref={ref} render={children} {...props} />
    }

    return (
      <DialogPrimitive.Trigger ref={ref} {...props}>
        {children}
      </DialogPrimitive.Trigger>
    )
  },
)
DialogTrigger.displayName = "DialogTrigger"

type DialogCloseProps = DialogPrimitive.Close.Props & {
  asChild?: boolean
}

const DialogClose = React.forwardRef<HTMLButtonElement, DialogCloseProps>(
  ({ asChild, children, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return <DialogPrimitive.Close ref={ref} render={children} {...props} />
    }

    return (
      <DialogPrimitive.Close ref={ref} {...props}>
        {children}
      </DialogPrimitive.Close>
    )
  },
)
DialogClose.displayName = "DialogClose"

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Backdrop>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Backdrop
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      "dialog-overlay fixed inset-0 z-50 bg-background/28 opacity-100 backdrop-blur-2xl transition-opacity duration-[220ms] ease-out will-change-[opacity] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-[180ms] data-[ending-style]:ease-in motion-reduce:transition-none dark:bg-background/42",
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = "DialogOverlay"

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> & {
  showCloseButton?: boolean
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  DialogContentProps
>(({ className, children, showCloseButton = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <div className="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none">
      <DialogPrimitive.Popup
        ref={ref}
        data-slot="dialog-content"
        className={cn(
          "dialog-content pointer-events-auto relative grid max-h-full w-full max-w-lg gap-4 rounded-lg border border-border/50 bg-background/95 p-6 text-foreground opacity-100 shadow-[0_8px_24px_rgba(15,23,42,0.07)] outline-none transition-opacity duration-[220ms] ease-out will-change-[opacity] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-[180ms] data-[ending-style]:ease-in motion-reduce:transition-none dark:shadow-[0_18px_48px_rgba(0,0,0,0.32)]",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            className={cn(
              buttonVariants({ variant: "window", size: "icon-sm" }),
              "absolute right-3 top-3",
            )}
            data-control="close"
            aria-label="Close dialog"
            title="Close"
          >
            <X size={16} strokeWidth={2} />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </div>
  </DialogPortal>
))
DialogContent.displayName = "DialogContent"

function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="dialog-title"
    className={cn("text-lg font-semibold leading-none tracking-normal", className)}
    {...props}
  />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="dialog-description"
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = "DialogDescription"

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
}
