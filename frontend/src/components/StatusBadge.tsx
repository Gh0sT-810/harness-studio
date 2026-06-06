import { Badge } from '@/components/ui/badge'

export function StatusBadge({ status, id }: { status: string; id: string }) {
  const variant = status === 'passed' || status === 'completed' || status === 'ok' ? 'default' : status === 'failed' ? 'destructive' : 'secondary'

  return (
    <Badge data-id={id} variant={variant} className="font-mono">
      {status}
    </Badge>
  )
}
