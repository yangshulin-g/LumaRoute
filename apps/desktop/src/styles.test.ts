import { describe, expect, it } from 'vitest'
import styles from './styles.css?raw'

describe('Aurora global styles', () => {
  it('defines dark native-CSS tokens and glass fallback without Tailwind', () => {
    expect(styles).toContain('color-scheme: dark')
    expect(styles).toContain('--lr-bg-base: #080c14')
    expect(styles).toContain('--lr-accent-cyan: #06b6d4')
    expect(styles).toContain('.lr-glass-card')
    expect(styles).toContain('@supports ((backdrop-filter: blur(1px))')
    expect(styles).not.toContain('@tailwind')
  })

  it('keeps glass cards opaque unless backdrop-filter is supported', () => {
    const supportsAt = styles.indexOf('@supports ((backdrop-filter: blur(1px))')
    const baseStart = styles.indexOf('.lr-glass-card {')
    const baseRule = styles.slice(baseStart, styles.indexOf('}', baseStart))
    const supportsBlock = styles.slice(supportsAt, styles.indexOf('\n}', supportsAt))

    expect(baseStart).toBeGreaterThan(-1)
    expect(baseStart).toBeLessThan(supportsAt)
    expect(baseRule).toContain('background: var(--lr-surface-card-solid)')
    expect(baseRule).not.toContain('var(--lr-surface-card)')
    expect(styles).toMatch(/--lr-surface-card-solid: #[0-9a-f]{6};/)
    expect(supportsBlock).toContain('background: var(--lr-surface-card)')
    expect(supportsBlock).toContain('backdrop-filter: blur(16px)')
  })

  it('disables decorative motion when the user requests reduced motion', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('animation-duration: 0.01ms')
  })
})
