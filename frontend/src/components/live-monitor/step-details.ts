import { scrollDelta, stepCoordinates } from '@/components/live-monitor/screen-geometry'
import { TimelineStep } from '@/lib/artifacts'

/** Text payload of a `type`/`type_text` action, if any. */
export function stepTypedText(step: TimelineStep | undefined): string {
  const raw = step?.args?.text
  return typeof raw === 'string' ? raw : ''
}

/** Human label for a keypress action (`ctrl+a`, `Enter`, …). */
export function stepKeyLabel(step: TimelineStep | undefined): string {
  const keys = step?.args?.keys ?? step?.args?.key
  if (Array.isArray(keys)) return keys.join('+')
  if (typeof keys === 'string') return keys
  return ''
}

export type StepDetailChip = { label: string; value: string }

/**
 * Decodes the "what was performed" chips for a timeline step from its args,
 * reusing the same coordinate/scroll extraction the screenshot stage uses so
 * the side panel never drifts from the overlay. Returns an ordered list so the
 * caller can render them as labelled chips.
 */
export function stepDetailChips(step: TimelineStep | undefined): StepDetailChip[] {
  const chips: StepDetailChip[] = []
  const coordinates = stepCoordinates(step)
  if (coordinates) chips.push({ label: 'Coords', value: coordinates.label })
  const text = stepTypedText(step)
  if (text) chips.push({ label: 'Text', value: `"${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"` })
  const key = stepKeyLabel(step)
  if (key) chips.push({ label: 'Key', value: key })
  const scroll = scrollDelta(step)
  if (scroll) chips.push({ label: 'Scroll', value: `(${scroll.x}, ${scroll.y})` })
  return chips
}

/** Whether the step has any captured screenshot (before or after). */
export function stepHasScreenshot(step: TimelineStep | undefined): boolean {
  return Boolean(step?.beforeArtifactId || step?.afterArtifactId)
}
