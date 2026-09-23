import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DiagnosticPanel from './DiagnosticPanel.vue'

describe('DiagnosticPanel', () => {
  it('announces successful diagnostic copy only after the callback resolves', async () => {
    let resolveCopy: () => void = () => {}
    const copyReport = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCopy = resolve
        }),
    )
    const wrapper = mount(DiagnosticPanel, { props: { report: 'safe', copyReport } })
    await wrapper.get('[data-testid="copy-diagnostics"]').trigger('click')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)

    resolveCopy()
    await flushPromises()
    expect(copyReport).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[role="status"]').text()).toBe('诊断信息已复制')
  })

  it('reports a failed copy without claiming success', async () => {
    const copyReport = vi.fn().mockRejectedValue(new Error('denied'))
    const wrapper = mount(DiagnosticPanel, { props: { report: 'safe', copyReport } })
    await wrapper.get('[data-testid="copy-diagnostics"]').trigger('click')
    await flushPromises()
    const status = wrapper.get('[role="status"]').text()
    expect(status).toBe('复制失败')
    expect(status).not.toContain('已复制')
  })
})
