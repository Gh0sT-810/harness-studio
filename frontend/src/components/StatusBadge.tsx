import { Badge } from '@/components/ui/badge'

export function StatusBadge({ status, id }: { status: string; id: string }) {
  const normalized = status.toLowerCase()
  const variant =
    normalized === 'passed' || normalized === 'completed' || normalized === 'ok' || normalized === 'live' || normalized === 'connected'
      ? 'success'
      : normalized === 'failed' || normalized === 'crashed' || normalized === 'timeout'
        ? 'destructive'
        : normalized === 'pending' || normalized === 'queued' || normalized === 'reconnecting' || normalized === 'fallback' || normalized === 'untested'
          ? 'warning'
          : normalized === 'executing' || normalized === 'running' || normalized === 'in_progress' || normalized === 'retrying'
            ? 'active'
            : 'secondary'

  return (
    <Badge data-id={id} variant={variant} className="font-mono">
      {status}
    </Badge>
  )
}
