// Local real Auth/REST/Realtime, fictional accounts, mocked AI, no hosted access.
import {spawn} from 'node:child_process'
import {localServices} from './native-services-env.mjs'
import {chromeReviewKeys} from './push-chrome-review.mjs'
const state=localServices(),action=process.argv[2]
if(!['build','serve'].includes(action)||!process.argv.includes('--synthetic-only'))throw new Error('Explicit local build/serve required')
const env={...process.env,ARIZE_EDITION:'adult',NATIVE_API_ENABLED:'true',NATIVE_ALLOWED_ORIGINS:'capacitor://localhost,http://127.0.0.1:3183',NEXT_PUBLIC_SUPABASE_URL:state.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:state.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:state.SERVICE_ROLE_KEY,NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3190',OPENAI_API_KEY:'fictional-local-ai-not-valid',STRIPE_EXPECTED_MODE:'test',ARIZE_STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',STRIPE_CHECKOUT_ENABLED:'false',NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED:'false',BILLING_ENFORCEMENT_ENABLED:'true',BILLING_ACCESS_SIGNING_SECRET:'fictional-native-services-continuity-secret-only',BROWSER_PUSH_ENABLED:'false',BROWSER_PUSH_SEND_ENABLED:'false',NEXT_PUBLIC_BROWSER_PUSH_ENABLED:'false',MARKETING_LEAD_CAPTURE_ENABLED:'false',MARKETING_NOTIFICATION_ENABLED:'false'}
delete env.VERCEL;delete env.STRIPE_SECRET_KEY
env.ARIZE_LOCAL_PUSH_DIAGNOSTICS=process.argv.includes('--push-chrome-test')?'true':'false'
// UI/API-only review mode. No valid VAPID sender keys, provider requests or permission clicks.
if(process.argv.includes('--push-review'))Object.assign(env,{BROWSER_PUSH_ENABLED:'true',NEXT_PUBLIC_BROWSER_PUSH_ENABLED:'true',BROWSER_PUSH_SEND_ENABLED:'false',NEXT_PUBLIC_BROWSER_PUSH_VAPID_PUBLIC_KEY:'',BROWSER_PUSH_VAPID_PRIVATE_KEY:'',BROWSER_PUSH_CONTACT:'mailto:fictional@example.test',BROWSER_PUSH_DISPATCH_SECRET:'fictional-local-push-operator-secret-only-123456'})
// Explicit, approved desktop test: public half only. The server still cannot send.
if(process.argv.includes('--push-chrome-test')){
 const keys=chromeReviewKeys()
 Object.assign(env,{BROWSER_PUSH_ENABLED:'true',NEXT_PUBLIC_BROWSER_PUSH_ENABLED:'true',BROWSER_PUSH_SEND_ENABLED:'false',NEXT_PUBLIC_BROWSER_PUSH_VAPID_PUBLIC_KEY:keys.publicKey,BROWSER_PUSH_VAPID_PRIVATE_KEY:'',BROWSER_PUSH_CONTACT:'mailto:fictional@example.test',BROWSER_PUSH_DISPATCH_SECRET:'fictional-local-push-operator-secret-only-123456'})
}
if(action==='serve'){env.ARIZE_NATIVE_LOCAL_SERVICES='true';env.NODE_OPTIONS='--import=./tests/fixtures/native-services-network.mjs'}else delete env.NODE_OPTIONS
const args=action==='build'?['build','--webpack']:['start','--hostname','127.0.0.1','--port','3190']
const child=spawn(process.execPath,['node_modules/next/dist/bin/next',...args],{env,stdio:'inherit'})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
child.on('exit',code=>{process.exitCode=code??1})
