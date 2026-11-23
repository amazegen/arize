// Explicit Debug/Simulator-only artifact. No archive, provisioning or upload.
import {spawnSync,execFileSync} from 'node:child_process'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
import {localServices} from './native-services-env.mjs'
if(!process.argv.includes('--synthetic-only'))throw new Error('Explicit local simulator fixture required')
const state=localServices(),root=fileURLToPath(new URL('../../apps/mobile/',import.meta.url))
function run(command,args,env=process.env){const r=spawnSync(command,args,{cwd:root,env,stdio:'inherit'});if(r.status!==0)throw new Error('Local simulator preparation failed')}
run('npm',['run','ios:check'])
run('npm',['run','build'],{...process.env,VITE_ARIZE_EDITION:'adult',VITE_NATIVE_ENABLED:'true',VITE_NATIVE_LOCAL_TEST:'true',VITE_NATIVE_SIMULATOR_TEST:'true',VITE_ADULT_SUPABASE_URL:state.API_URL,VITE_ADULT_SUPABASE_PUBLISHABLE_KEY:state.ANON_KEY,VITE_ADULT_API_ORIGIN:'http://127.0.0.1:3190',VITE_NATIVE_GOOGLE_ENABLED:'false'})
run('npm',['run','ios:sync'])
const derived=mkdtempSync('/private/tmp/arize-ios-connected-simulator.')
const plist=JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-',root+'/ios/App/App/Info.plist'],{encoding:'utf8'}))
plist.NSAppTransportSecurity={NSExceptionDomains:{'127.0.0.1':{NSExceptionAllowsInsecureHTTPLoads:true,NSIncludesSubdomains:false}}}
// Xcode owns DerivedData/Info.plist and overwrites it with workspace metadata.
// Keep the fixture's input separate so the installed app retains its bundle ID.
const fixturePlist=derived+'/SimulatorFixture-Info.plist'
writeFileSync(derived+'/SimulatorFixture-Info.json',JSON.stringify(plist))
execFileSync('/usr/bin/plutil',['-convert','xml1','-o',fixturePlist,derived+'/SimulatorFixture-Info.json'])
console.log('Local Debug simulator build directory: '+derived)
run('/usr/bin/xcodebuild',['-project','ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','-derivedDataPath',derived,'CODE_SIGNING_ALLOWED=NO','CODE_SIGNING_REQUIRED=NO','SWIFT_ACTIVE_COMPILATION_CONDITIONS=DEBUG ARIZE_SIMULATOR_TEST','INFOPLIST_FILE='+fixturePlist,'-quiet','build'])
const artifact=derived+'/Build/Products/Debug-iphonesimulator/App.app'
const built=JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-',artifact+'/Info.plist'],{encoding:'utf8'}))
assert.equal(built.CFBundleIdentifier,'com.amazegen.arize.dev','Simulator artifact identity was lost during compilation')
assert.deepEqual(built.NSAppTransportSecurity,plist.NSAppTransportSecurity,'Simulator loopback transport guard was lost during compilation')
console.log('Local connected simulator artifact: '+artifact)
