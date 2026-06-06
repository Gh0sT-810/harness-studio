export function EmptyState({ message, id }: { message: string; id: string }) {
  return (
    <div data-id={id} className="rounded-lg border border-dashed border-[var(--hairline)] bg-[var(--canvas)] p-6 text-sm text-[var(--steel)]">
      {message}
    </div>
  )
}
