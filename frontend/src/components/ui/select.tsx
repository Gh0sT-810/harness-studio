import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import type * as React from 'react'

import { cn } from '@/lib/utils'

type SelectOption = {
  label: string
  value: string
}

type SelectProps = {
  className?: string
  contentClassName?: string
  dataId: string
  disabled?: boolean
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  value: string
}

export function Select({
  className,
  contentClassName,
  dataId,
  disabled = false,
  onValueChange,
  options,
  placeholder = 'Select',
  value,
}: SelectProps) {
  return (
    <SelectPrimitive.Root disabled={disabled} onValueChange={onValueChange} value={value}>
      <SelectPrimitive.Trigger
        className={cn(
          'flex h-10 w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas)] px-4 py-2 text-left text-base leading-normal text-[var(--ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--brand-green)] disabled:cursor-not-allowed disabled:bg-[var(--surface)] disabled:text-[var(--muted)]',
          className,
        )}
        data-id={dataId}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--steel)]" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={cn(
            'z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas)] p-1 text-[var(--ink)] shadow-[var(--shadow-card)]',
            contentClassName,
          )}
          data-id={`${dataId}-content`}
          position="popper"
          sideOffset={6}
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectItem data-id={`${dataId}-option-${option.value}`} key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

const SelectItem = ({ children, className, ...props }: SelectPrimitive.SelectItemProps & React.ComponentPropsWithoutRef<'div'>) => (
  <SelectPrimitive.Item
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-[var(--radius-sm)] py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:bg-[var(--surface)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-3 flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
)
