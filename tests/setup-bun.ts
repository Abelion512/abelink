import 'fake-indexeddb/auto'
import { vi } from 'vitest'
if (vi && typeof vi.hoisted !== 'function') {
  vi.hoisted = (fn) => fn()
}
