// Run only against the documented fictional loopback fixture and Next server.
import assert from 'node:assert/strict'
if (!process.argv.includes('--synthetic-only')) throw new Error('Explicit fictional fixture flag required')
const app = 'http://127.0.0.1:3169', backend = 'http://127.0.0.1:3168'
async function cookie(email) {
 const response = await fetch(`${backend}/auth/v1/token?grant_type=password`, { method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'founder-fixture-only'}) })
 assert.equal(response.status,200)
 return `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(await response.json())).toString('base64url')}`
}
assert.equal((await fetch(`${app}/api/admin/founder`)).status,401)
const ordinary = await cookie('ordinary@example.test')
assert.equal((await fetch(`${app}/api/admin/founder`,{headers:{cookie:ordinary}})).status,403)
const founder = await cookie('founder@example.test')
for (const days of [7,30,90]) {
 const response = await fetch(`${app}/api/admin/founder?days=${days}`,{headers:{cookie:founder}})
 assert.equal(response.status,200)
 assert.match(response.headers.get('cache-control'),/private, no-store/)
 const body = await response.json()
 assert.equal(body.metrics.days,days);assert.equal(body.metrics.trend.length,days)
 assert.equal(body.metrics.billingMode,'test');assert.equal(body.student.status,'not_connected')
 assert.doesNotMatch(JSON.stringify(body),/example\.test|Fictional local test text|sub_fictional|user_id|journal_text/)
}
for (const query of ['days=1','days=7&days=90','days=7&mode=live']) assert.equal((await fetch(`${app}/api/admin/founder?${query}`,{headers:{cookie:founder}})).status,400)
console.log('Founder local HTTP/real-SQL checks passed: 401,403,200 x3,400 x3, no-store, aggregate-only, sandbox-only API scope.')
