import type { Register } from 'claude-code'

import { registerTracker } from './core'

export const register: Register = on => registerTracker(on)
