'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/classolo/lib/utils'

const buttonVariants = cva(
  "motion-press inline-flex shrink-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap outline-none transition-[opacity,background-color,border-color,color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)] focus-visible:ring-1 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'rounded-lg bg-primary text-primary-foreground hover:brightness-95',
        destructive:
          'rounded-lg bg-destructive text-destructive-foreground hover:brightness-95',
        outline:
          'rounded-lg border border-border bg-background text-foreground hover:bg-muted',
        secondary:
          'rounded-lg bg-secondary text-secondary-foreground hover:brightness-95',
        ghost:
          'rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground',
        link: 'rounded-none text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-1.5 text-sm',
        xs: 'h-6 gap-1 rounded-md px-2 text-xs',
        sm: 'h-8 px-3 text-sm',
        lg: 'h-10 px-6 text-sm',
        icon: 'size-9 rounded-lg',
        'icon-xs': 'size-6 rounded-md',
        'icon-sm': 'size-8 rounded-lg',
        'icon-lg': 'size-10 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
