export type MobileEnv = Record<string,string|boolean|undefined>
export type MobileConfig = { supabaseUrl:string;publicKey:string;apiOrigin:string;localTest:boolean;google:boolean;callback:string }
export function mobileConfig(env: MobileEnv, native: boolean, simulatorFixture = false): MobileConfig | null {
  if (env.VITE_NATIVE_ENABLED!=='true') return null
  if (env.VITE_ARIZE_EDITION!=='adult') throw new Error('Only the adult app may use this native build.')
  const simulatorTest=native&&env.VITE_NATIVE_SIMULATOR_TEST==='true'
  if(simulatorTest&&!simulatorFixture)throw new Error('This native build is not an explicit Debug simulator fixture.')
  const localTest=env.VITE_NATIVE_LOCAL_TEST==='true'&&(!native||simulatorTest&&simulatorFixture)
  function origin(value: unknown) {
    if (typeof value!=='string') throw new Error('Adult account services are not configured.')
    const url=new URL(value)
    if (url.origin!==value || url.username || url.password || (url.protocol!=='https:' && !(localTest && url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))) || url.hostname==='students.arizeapp.com') throw new Error('Only configured secure adult services are allowed.')
    return value
  }
  const supabaseUrl=origin(env.VITE_ADULT_SUPABASE_URL),apiOrigin=origin(env.VITE_ADULT_API_ORIGIN),publicKey=String(env.VITE_ADULT_SUPABASE_PUBLISHABLE_KEY ?? '')
  if(simulatorTest&&(!localTest||supabaseUrl!=='http://127.0.0.1:56581'||apiOrigin!=='http://127.0.0.1:3190'))throw new Error('Simulator fixtures can only connect to the named loopback test services.')
  let anon=false
  try { anon=JSON.parse(atob(publicKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon' } catch { /* Publishable keys are opaque. */ }
  if (!publicKey.startsWith('sb_publishable_') && !anon && !(localTest && publicKey==='synthetic-native-anon')) throw new Error('Use only the adult publishable key, never a server secret.')
  return {supabaseUrl,apiOrigin,publicKey,localTest,google:env.VITE_NATIVE_GOOGLE_ENABLED==='true' && native&&!localTest,callback:'com.amazegen.arize.dev://auth/callback'}
}
export function authCallback(value: string, expected: string) {
  const url=new URL(value),target=new URL(expected)
  if (url.protocol!==target.protocol || url.host!==target.host || url.pathname!==target.pathname || url.hash || url.username || url.password || url.searchParams.getAll('code').length!==1 || [...url.searchParams.keys()].some(k=>k!=='code')) throw new Error('This account link is not valid for Arize.')
  const code=url.searchParams.get('code')
  if (!code || !/^[a-zA-Z0-9_-]{10,256}$/.test(code)) throw new Error('This account link has expired or is invalid.')
  return code
}
