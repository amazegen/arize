// Preload ONLY into the local Next server. Fail closed for ALL hosted requests.
if(process.env.ARIZE_NATIVE_FIXTURE!=='true'||process.env.VERCEL||process.env.NEXT_PUBLIC_APP_URL!=='http://127.0.0.1:3187')throw new Error('Local fictional native fixture required')
const original=globalThis.fetch
globalThis.fetch=(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
 if(url.origin==='https://api.openai.com'&&url.pathname.startsWith('/v1/')){
  if(new Headers(init?.headers).get('authorization')!=='Bearer fictional-local-ai-not-valid')return Promise.reject(new Error('Only a fictional AI credential may be used in this fixture'))
  return original(`http://127.0.0.1:3186/fixture/openai${url.pathname.slice(3)}`,init)
 }
 if(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&['3186','3187'].includes(url.port))return original(input,init)
 return Promise.reject(new Error('Hosted network access is forbidden in the native test fixture'))
}
