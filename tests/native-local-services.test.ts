import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=(name:string)=>readFileSync(new URL(`fixtures/${name}`,import.meta.url),'utf8')
test('real-service test harness refuses hosted backends, linked projects and non-loopback published ports',()=>{
 const env=read('native-services-env.mjs'),server=read('native-services-server.mjs'),network=read('native-services-network.mjs')
 assert.match(env,/supabase\/\.temp\/project-ref/)
 assert.match(env,/state.API_URL,'http:\/\/127.0.0.1:56581'/)
 assert.match(env,/HostIp==='127.0.0.1'/)
 assert.match(env,/com.supabase.cli.project/)
 assert.match(server,/STRIPE_EXPECTED_MODE:'test'/);assert.match(server,/ARIZE_STRIPE_SECRET_KEY:''/)
 assert.match(server,/STRIPE_CHECKOUT_ENABLED:'false'/)
 assert.match(network,/Hosted network access forbidden/)
 assert.match(network,/fictional-local-ai-not-valid/)
 assert.doesNotMatch(network,/students\.arizeapp\.com|supabase\.co/)
})
