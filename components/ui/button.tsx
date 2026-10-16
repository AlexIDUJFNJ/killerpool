import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        xl: "h-14 rounded-lg px-10 text-lg",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type AnyProps = Record<string, unknown>

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.RefObject<T | null>).current = node
    }
  }
}

/**
 * Renders its only child with the slot's props merged in — what Radix's Slot
 * does, without the dependency. Classes are concatenated, styles merged, and
 * an event handler on both sides runs the child's first.
 */
const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ children, ...slotProps }, forwardedRef) => {
    if (!React.isValidElement<AnyProps>(children)) {
      return null
    }

    const childProps = children.props
    const merged: AnyProps = { ...slotProps, ...childProps }

    for (const key of Object.keys(slotProps)) {
      const slotValue = (slotProps as AnyProps)[key]
      const childValue = childProps[key]
      if (/^on[A-Z]/.test(key) && typeof slotValue === "function" && typeof childValue === "function") {
        merged[key] = (...args: unknown[]) => {
          childValue(...args)
          slotValue(...args)
        }
      } else if (key === "style") {
        merged.style = { ...(slotValue as object), ...(childValue as object) }
      } else if (key === "className") {
        merged.className = cn(slotValue as string, childValue as string)
      }
    }

    // React 19 passes ref as an ordinary prop
    merged.ref = composeRefs(forwardedRef, childProps.ref as React.Ref<HTMLElement> | undefined)

    return React.cloneElement(children, merged)
  }
)
Slot.displayName = "Slot"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Style the single child (typically a next/link `Link`) as the button
   * instead of rendering a `<button>`. Wrapping a Button in a Link puts a
   * button inside an anchor, which is invalid HTML and gives keyboard and
   * screen-reader users two nested controls for one action.
   */
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, className }))

    if (asChild) {
      return (
        <Slot
          className={classes}
          ref={ref as React.Ref<HTMLElement>}
          {...(props as React.HTMLAttributes<HTMLElement>)}
        />
      )
    }

    return <button className={classes} ref={ref} {...props} />
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
