import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import OnboardingView from './OnboardingView.vue'

describe('OnboardingView', () => {
  it('submits the selected server kind and clears the password field', async () => {
    const addServer = vi.fn().mockResolvedValue({ id: 'profile-1' })
    const wrapper = mount(OnboardingView, { props: { addServer } })
    await wrapper.get('[name="kind"]').setValue('jellyfin')
    await wrapper.get('[name="name"]').setValue('Home')
    await wrapper.get('[name="baseUrl"]').setValue('https://media.example.com')
    await wrapper.get('[name="username"]').setValue('alice')
    await wrapper.get('[name="password"]').setValue('secret')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(addServer).toHaveBeenCalledWith(expect.objectContaining({ kind: 'jellyfin' }))
    expect((wrapper.get('[name="password"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('Home')
  })

  it.each([
    [
      { code: 'AuthenticationExpired', message: 'Server credential was rejected' },
      'Authentication failed. Check the username and password.',
    ],
    [
      { status: 403, message: 'HTTP 403' },
      'Server rejected the request (HTTP 403). Check its access rules.',
    ],
    [
      { code: 'LineTimeout', message: 'Request timed out' },
      'Connection timed out. Check the server address and network.',
    ],
    [
      'invalid peer certificate: UnknownIssuer',
      'TLS certificate validation failed. Use a valid HTTPS certificate.',
    ],
    [
      'sql.execute not allowed. Permissions associated with this command: sql:allow-execute',
      'Unable to save the login securely. Check local storage and system keychain access.',
    ],
  ])('shows an actionable login failure for %#', async (failure, expected) => {
    const addServer = vi.fn().mockRejectedValue(failure)
    const wrapper = mount(OnboardingView, { props: { addServer } })
    await wrapper.get('[name="name"]').setValue('Home')
    await wrapper.get('[name="baseUrl"]').setValue('https://media.example.com')
    await wrapper.get('[name="username"]').setValue('alice')
    await wrapper.get('[name="password"]').setValue('secret')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="onboarding-error"]').text()).toBe(expected)
    expect((wrapper.get('[name="password"]').element as HTMLInputElement).value).toBe('')
  })
})
