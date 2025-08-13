/// <reference types="vite/client" />

// Необязательно, но полезно явно описать нужные переменные:
interface ImportMetaEnv {
  readonly VITE_API_BASE: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
