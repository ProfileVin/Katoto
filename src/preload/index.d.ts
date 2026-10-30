import type { KatotoApi } from './index'

declare global {
  interface Window {
    Katoto: KatotoApi
  }
}
