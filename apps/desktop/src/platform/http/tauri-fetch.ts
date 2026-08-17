import { fetch as pluginFetch } from '@tauri-apps/plugin-http'
import { headersWithLumaRouteUserAgent, LUMAROUTE_USER_AGENT } from './lumaroute-user-agent'

type PluginFetch = typeof pluginFetch

/**
 * Wrap `@tauri-apps/plugin-http` fetch so every request carries LumaRoute's UA.
 * The plugin falls back to `tauri-plugin-http/<ver>` when User-Agent is missing;
 * some reverse proxies reject that string with HTTP 403.
 */
export function createTauriFetch(fetchImpl: PluginFetch = pluginFetch): typeof fetch {
  return async (input, init) => {
    const headers = headersWithLumaRouteUserAgent(init?.headers, LUMAROUTE_USER_AGENT)
    return fetchImpl(input, {
      ...init,
      headers,
    }) as Promise<Response>
  }
}
