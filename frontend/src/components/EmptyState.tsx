export function EmptyState({ message, id }: { message: string; id: string }) {
  return (
    <div data-id={id} className="harness-empty-state">
      {message}
    </div>
  )
}
