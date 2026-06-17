import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-[1.4] transition-colors',
  {
    variants: {
      variant: {
        default: 'harness-badge-muted',
        secondary: 'harness-badge-muted',
        destructive: 'harness-badge-error',
        outline: 'border-[var(--hairline)] text-[var(--ink)]',
        discount: 'harness-badge-discount border-transparent',
        required: 'harness-badge-required border-transparent rounded-sm uppercase tracking-[0.5px]',
        type: 'harness-badge-type rounded-sm',
        tag: 'harness-badge-tag border-transparent rounded-sm',
        success: 'harness-badge-success',
        warning: 'harness-badge-warning',
        active: 'harness-badge-active',
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
