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

  it('disables decorative motion when the user requests reduced motion', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('animation-duration: 0.01ms')
  })
})
