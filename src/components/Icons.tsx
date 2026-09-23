import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const MenuIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} {...props} aria-hidden="true">
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
)

export const SunIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} {...props} aria-hidden="true">
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </svg>
)

export const MoonIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} {...props} aria-hidden="true">
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </svg>
)

export const SpeakerIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} {...props} aria-hidden="true">
    <path d="M11 5 6 9H3v6h3l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
  </svg>
)

export const PrevIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} {...props} aria-hidden="true">
    <path d="M18 5 8 12l10 7V5z" />
    <path d="M5 5v14" />
  </svg>
)

export const NextIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} {...props} aria-hidden="true">
    <path d="M6 5l10 7L6 19V5z" />
    <path d="M19 5v14" />
  </svg>
)

export const PlayIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M7 4.5 19 12 7 19.5V4.5z" />
  </svg>
)

export const PauseIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
  </svg>
)

export const UploadIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
        {...stroke}
    strokeWidth={1.8}
    {...props}
    aria-hidden="true"
  >
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M3.5 15v3.5A1.5 1.5 0 0 0 5 20h14a1.5 1.5 0 0 0 1.5-1.5V15" />
  </svg>
)

export const LockIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
        {...stroke}
    strokeWidth={1.8}
    {...props}
    aria-hidden="true"
  >
    <rect x="4" y="10.5" width="16" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
)

export const DownloadIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} {...props} aria-hidden="true">
    <path d="M12 4v11m0 0-4-4m4 4 4-4" />
    <path d="M4 18.5h16" />
  </svg>
)

export const PlusIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} {...props} aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const CloseIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} {...props} aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const TickIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
        {...stroke}
    strokeWidth={2.6}
    {...props}
    aria-hidden="true"
  >
    <path d="M4 12.5 9.5 18 20 6.5" />
  </svg>
)

export const AlertIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
        {...stroke}
    strokeWidth={1.8}
    {...props}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.2v.3" />
  </svg>
)

export const ProgressRing = ({ fraction }: { fraction: number }) => {
  const radius = 9.5
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, fraction))
  return (
    <svg className="ring" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="bg" cx="12" cy="12" r={radius} />
      <circle
        className="fg"
        cx="12"
        cy="12"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
      />
    </svg>
  )
}
