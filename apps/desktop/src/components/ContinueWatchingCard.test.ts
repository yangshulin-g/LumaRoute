import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ContinueWatchingCard from './ContinueWatchingCard.vue'

const item = {
  id: 'movie-1',
  kind: 'movie',
  name: 'Arrival',
  overview: null,
  productionYear: 2016,
  runtimeSeconds: 120,
  parentId: null,
  seriesId: null,
  indexNumber: null,
  imageTag: null,
  playbackPositionSeconds: 90,
} as const

describe('ContinueWatchingCard', () => {
  it('renders progress computed from real media fields', () => {
    const wrapper = mount(ContinueWatchingCard, {
      props: { item, profileId: 'profile-1' },
      global: { stubs: { MediaCard: { template: '<div>Arrival</div>' } } },
    })
    expect(wrapper.get('progress').attributes('value')).toBe('75')
    expect(wrapper.get('[data-testid="continue-progress"]').text()).toBe('75%')
  })
})
