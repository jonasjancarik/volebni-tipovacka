import { useRef, useState } from "react"

import { cn } from "@/lib/utils"

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * A bar that can be dragged (or moved with arrow keys) to set a percentage.
 * `scale` is the value at the full width, `max` the most this bar may reach.
 */
export function ShareSlider(props: {
  value: number
  scale: number
  max: number
  muted?: boolean
  label: string
  onChange: (value: number) => void
}) {
  const { value, scale, max, muted, label, onChange } = props
  const track = useRef<HTMLDivElement>(null)
  // While dragging, the scale stays put so the bars do not jump under the finger.
  const [frozenScale, setFrozenScale] = useState<number | null>(null)
  const activeScale = frozenScale ?? scale

  const fromPointer = (clientX: number, atScale: number) => {
    const rect = track.current!.getBoundingClientRect()
    return round1(Math.max(0, Math.min(max, atScale, ((clientX - rect.left) / rect.width) * atScale)))
  }

  const width = activeScale > 0 ? Math.max(0, Math.min(100, (value / activeScale) * 100)) : 0

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={round1(Math.min(max, 100))}
      aria-valuenow={round1(value)}
      aria-valuetext={`${round1(value).toLocaleString("cs-CZ")} %`}
      className="relative h-6 w-full cursor-ew-resize touch-none rounded-md bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setFrozenScale(scale)
        onChange(fromPointer(e.clientX, scale))
      }}
      onPointerMove={(e) => {
        if (frozenScale !== null) onChange(fromPointer(e.clientX, frozenScale))
      }}
      onPointerUp={() => setFrozenScale(null)}
      onPointerCancel={() => setFrozenScale(null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 5 : 0.5
        const next =
          e.key === "ArrowRight" || e.key === "ArrowUp"
            ? value + step
            : e.key === "ArrowLeft" || e.key === "ArrowDown"
              ? value - step
              : e.key === "Home"
                ? 0
                : e.key === "End"
                  ? max
                  : null
        if (next === null) return
        e.preventDefault()
        onChange(round1(Math.max(0, Math.min(max, next))))
      }}
    >
      <div
        className={cn("h-full rounded-md", muted ? "bg-muted-foreground/35" : "bg-gradient-to-r from-primary to-[oklch(0.62_0.21_350)]")}
        style={{ width: `${width}%` }}
      />
      <div
        className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-foreground/70"
        style={{ left: `${width}%` }}
        aria-hidden
      />
    </div>
  )
}
