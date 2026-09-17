/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly MODE: string
  readonly PROD: boolean
  readonly VITE_APP_NAME: string
  readonly VITE_PUBLIC_URL: string
  readonly VITE_API_URL: string
  readonly VITE_ENABLE_SOURCE_MAPPING: string
  readonly VITE_ENABLE_SSR: string
  /** Unique site/app identifier set by the container runtime (local-control-plane sets SITE_ID). */
  readonly SITE_ID: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __airoEditModeActive?: boolean
}

declare module 'virtual:format-overrides' {
  import type { FormatOverrideBundle } from '@/lib/format-overrides'

  const bundle: FormatOverrideBundle
  export default bundle
}
