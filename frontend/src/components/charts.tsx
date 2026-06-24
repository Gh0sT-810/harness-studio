import type { CSSProperties } from 'react'

// Dependency-free SVG chart primitives. All colors come from CSS design tokens
// so they adapt to light/dark automatically. Each accepts a `dataId` for stable
// test selectors and renders an empty (but valid) <svg> when there is no data.

type SparklineProps = {
  data: number[]
  width?: number
  height?: number
  stroke?: string
  fill?: string
  className?: string
  dataId?: string
}

export function Sparkline({ data, width = 96, height = 28, stroke = 'var(--brand-green)', fill = 'transparent', className, dataId }: SparklineProps) {
  if (data.length === 0) {
    return <svg data-id={dataId} width={width} height={height} className={className} role="img" aria-label="No data" />
  }
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = max - min
  const stepX = data.length > 1 ? width / (data.length - 1) : 0
  const points = data.map((value, index) => {
    const x = index * stepX
    const y = span === 0 ? height / 2 : height - ((value - min) / span) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point}`).join(' ')
  const area = fill === 'transparent' ? null : `${line} L${width.toFixed(2)},${height} L0,${height} Z`
  return (
    <svg data-id={dataId} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" preserveAspectRatio="none">
      {area ? <path d={area} fill={fill} stroke="none" /> : null}
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

type BarSeriesProps = {
  data: number[]
  width?: number
  height?: number
  gap?: number
  color?: string
  className?: string
  dataId?: string
}

export function BarSeries({ data, width = 240, height = 64, gap = 2, color = 'var(--brand-green)', className, dataId }: BarSeriesProps) {
  if (data.length === 0) {
    return <svg data-id={dataId} width={width} height={height} className={className} role="img" aria-label="No data" />
  }
  const max = Math.max(...data, 1)
  const barWidth = Math.max((width - gap * (data.length - 1)) / data.length, 0.5)
  return (
    <svg data-id={dataId} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" preserveAspectRatio="none">
      {data.map((value, index) => {
        const barHeight = (value / max) * height
        const x = index * (barWidth + gap)
        return <rect key={`bar-${index}`} x={x.toFixed(2)} y={(height - barHeight).toFixed(2)} width={barWidth.toFixed(2)} height={barHeight.toFixed(2)} rx={1} fill={color} />
      })}
    </svg>
  )
}

type BarMeterProps = {
  value: number // 0..1
  width?: number
  color?: string
  track?: string
  className?: string
  dataId?: string
}

export function BarMeter({ value, width = 64, color = 'var(--brand-green)', track = 'var(--surface-soft)', className, dataId }: BarMeterProps) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const style: CSSProperties = { width }
  return (
    <div data-id={dataId} className={`h-1.5 shrink-0 overflow-hidden rounded-full ${className ?? ''}`} style={{ ...style, background: track }} role="img" aria-label={`${Math.round(pct * 100)}%`}>
      <div className="h-full rounded-full" style={{ width: `${(pct * 100).toFixed(1)}%`, background: color }} />
    </div>
  )
}

export type DonutSegment = { value: number; color: string; label?: string }

type DonutProps = {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  className?: string
  dataId?: string
}

export function Donut({ segments, size = 96, thickness = 14, className, dataId }: DonutProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const radius = (size - thickness) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <svg data-id={dataId} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} role="img">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--surface-soft)" strokeWidth={thickness} />
      {total > 0
        ? segments.map((segment, index) => {
            const length = (segment.value / total) * circumference
            const dash = `${length.toFixed(2)} ${(circumference - length).toFixed(2)}`
            const element = (
              <circle
                key={`seg-${index}`}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={(-offset).toFixed(2)}
                transform={`rotate(-90 ${center} ${center})`}
              />
            )
            offset += length
            return element
          })
        : null}
    </svg>
  )
}
