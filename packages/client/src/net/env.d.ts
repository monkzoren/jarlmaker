/// <reference types="vite/client" />
// The Vite env keys the net module reads (config.ts).
interface ImportMetaEnv {
  readonly VITE_STDB_URI?: string
  readonly VITE_STDB_MODULE?: string
}
