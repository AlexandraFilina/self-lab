import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("button disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: { primary: "button-primary", secondary: "button-secondary", ghost: "button-ghost" },
  },
  defaultVariants: { variant: "primary" },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component className={cn(buttonVariants({ variant, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";
export { Button, buttonVariants };
