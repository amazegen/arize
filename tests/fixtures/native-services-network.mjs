if(process.env.ARIZE_NATIVE_LOCAL_SERVICES!=='true'||process.env.VERCEL||process.env.NEXT_PUBLIC_APP_URL!=='http://127.0.0.1:3190'||process.env.NEXT_PUBLIC_SUPABASE_URL!=='http://127.0.0.1:56581')throw new Error('Isolated local services only')
const original=globalThis.fetch
globalThis.fetch=(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
 if(url.origin==='https://api.openai.com'&&url.pathname.startsWith('/v1/')){
  if(new Headers(init?.headers).get('authorization')!=='Bearer fictional-local-ai-not-valid')return Promise.reject(new Error('Fictional AI credential required'))
  return original(`http://127.0.0.1:3191${url.pathname}`,init)
 }
 if(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&['3190','3191','56581'].includes(url.port))return original(input,init)
 return Promise.reject(new Error('Hosted network access forbidden in local acceptance server'))
}
