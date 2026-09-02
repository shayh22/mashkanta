/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute backend origin; empty in development, where Vite proxies /api. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
