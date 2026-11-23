import {spawn} from 'node:child_process'
import {localServices} from './native-services-env.mjs'
if(!process.argv.includes('--synthetic-only'))throw new Error('Local fictional browser build only')
const state=localServices()
const child=spawn('npm',['run','build'],{cwd:new URL('../../apps/mobile/',import.meta.url),stdio:'inherit',env:{...process.env,VITE_ARIZE_EDITION:'adult',VITE_NATIVE_ENABLED:'true',VITE_NATIVE_LOCAL_TEST:'true',VITE_ADULT_SUPABASE_URL:state.API_URL,VITE_ADULT_SUPABASE_PUBLISHABLE_KEY:state.ANON_KEY,VITE_ADULT_API_ORIGIN:'http://127.0.0.1:3190',VITE_NATIVE_GOOGLE_ENABLED:'false'}})
child.on('exit',code=>{process.exitCode=code??1})
