import { billingConfigErrors } from '../lib/billing/config.ts'
const errors = billingConfigErrors(process.env)
for (const error of errors) console.error(`ERROR: ${error}`)
if (errors.length) process.exitCode = 1
else console.log('Billing environment gate passed. No secret values printed. This does not verify hosted Stripe or activate billing.')
