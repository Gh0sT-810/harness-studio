import { Badge } from '@/components/ui/badge'

export function StatusBadge({ status, id }: { status: string; id: string }) {
  const normalized = status.toLowerCase()
  const variant =
    normalized === 'passed' || normalized === 'completed' || normalized === 'ok' || normalized === 'live'
      ? 'success'
      : normalized === 'failed' || normalized === 'crashed' || normalized === 'timeout'
        ? 'destructive'
        : normalized === 'pending' || normalized === 'queued' || normalized === 'reconnecting' || normalized === 'fallback'
          ? 'warning'
          : 'secondary'

  return (
    <Badge data-id={id} variant={variant} className="font-mono">
      {status}
    </Badge>
  )
}
