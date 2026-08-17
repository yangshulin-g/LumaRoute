import { inject, type App, type InjectionKey } from 'vue'
import type { AppServices } from './service-types'

export const servicesKey: InjectionKey<AppServices> = Symbol('lumaroute.services')

let providedServices: AppServices | null = null

export function provideServices(app: App, services: AppServices): void {
  providedServices = services
  app.provide(servicesKey, services)
}

export function injectServices(): AppServices {
  if (providedServices) return providedServices
  const services = inject(servicesKey)
  if (!services) {
    throw new Error('App services have not been provided')
  }
  return services
}
