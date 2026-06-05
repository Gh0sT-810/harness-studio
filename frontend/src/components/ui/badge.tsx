import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[var(--brand-green)] text-[var(--primary)]',
        secondary: 'border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink)]',
        destructive: 'border-transparent bg-[var(--brand-error)] text-white',
        outline: 'border-[var(--hairline)] text-[var(--ink)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />
}

export { Badge }
