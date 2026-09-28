// fixture: README and schema disagree in both directions.
import { z } from 'zod'

export const bellTuning = z.object({ volume: z.number(), pitch: z.number() })
