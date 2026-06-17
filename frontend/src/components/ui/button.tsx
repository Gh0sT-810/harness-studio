import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold leading-[1.3] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-[var(--hairline)] disabled:text-[var(--muted)] disabled:opacity-100',
  {
    variants: {
      variant: {
        default: 'bg-[var(--brand-green)] text-[var(--on-accent)] hover:bg-[var(--brand-green-deep)]',
        primary: 'bg-[var(--brand-green)] text-[var(--on-accent)] hover:bg-[var(--brand-green-deep)]',
        accent: 'bg-[var(--brand-green)] text-[var(--on-accent)] hover:bg-[var(--brand-green-deep)]',
        accentGreen: 'bg-[var(--brand-green)] text-[var(--on-accent)] hover:bg-[var(--brand-green-deep)]',
        onDark: 'bg-[var(--on-dark)] text-[var(--on-accent)] hover:bg-[var(--surface-soft)]',
        secondary:
          'border border-[var(--hairline)] bg-transparent text-[var(--ink)] hover:border-[var(--steel)] hover:bg-[var(--surface)]',
        ghost: 'rounded-md bg-transparent text-[var(--steel)] hover:bg-[var(--surface)] hover:text-[var(--ink)]',
        link: 'h-auto rounded-none bg-transparent p-0 text-[var(--ink)] underline-offset-4 hover:underline',
        icon: 'h-9 w-9 rounded-md border border-[var(--hairline)] bg-[var(--surface)] p-0 text-[var(--steel)] hover:border-[var(--brand-green)] hover:text-[var(--ink)]',
      },
      size: {
        default: 'h-10 rounded-md px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-6',
        icon: 'h-9 w-9 rounded-md p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button }
