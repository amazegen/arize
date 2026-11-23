// Local real Auth/REST/Realtime, fictional accounts, mocked AI, no hosted access.
import {spawn} from 'node:child_process'
import {localServices} from './native-services-env.mjs'
const state=localServices(),action=process.argv[2]
if(!['build','serve'].includes(action)||!process.argv.includes('--synthetic-only'))throw new Error('Explicit local build/serve required')
const env={...process.env,ARIZE_EDITION:'adult',NATIVE_API_ENABLED:'true',NATIVE_ALLOWED_ORIGINS:'capacitor://localhost,http://127.0.0.1:3183',NEXT_PUBLIC_SUPABASE_URL:state.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:state.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:state.SERVICE_ROLE_KEY,NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3190',OPENAI_API_KEY:'fictional-local-ai-not-valid',STRIPE_EXPECTED_MODE:'test',ARIZE_STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',STRIPE_CHECKOUT_ENABLED:'false',NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED:'false',BILLING_ENFORCEMENT_ENABLED:'true',BILLING_ACCESS_SIGNING_SECRET:'fictional-native-services-continuity-secret-only',BROWSER_PUSH_ENABLED:'false',BROWSER_PUSH_SEND_ENABLED:'false',NEXT_PUBLIC_BROWSER_PUSH_ENABLED:'false',MARKETING_LEAD_CAPTURE_ENABLED:'false',MARKETING_NOTIFICATION_ENABLED:'false'}
delete env.VERCEL;delete env.STRIPE_SECRET_KEY
if(action==='serve'){env.ARIZE_NATIVE_LOCAL_SERVICES='true';env.NODE_OPTIONS='--import=./tests/fixtures/native-services-network.mjs'}else delete env.NODE_OPTIONS
const args=action==='build'?['build','--webpack']:['start','--hostname','127.0.0.1','--port','3190']
const child=spawn(process.execPath,['node_modules/next/dist/bin/next',...args],{env,stdio:'inherit'})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
child.on('exit',code=>{process.exitCode=code??1})
