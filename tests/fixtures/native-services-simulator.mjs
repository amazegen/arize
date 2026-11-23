// Explicit Debug/Simulator-only artifact. Xcode's local ad-hoc identity enables
// the simulator Keychain; no Apple identity, provisioning, archive or upload.
import {spawnSync,execFileSync} from 'node:child_process'
import {existsSync,mkdtempSync,writeFileSync} from 'node:fs'
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
// CODE_SIGNING_ALLOWED=NO omits the simulated application identifier and makes
// Keychain refuse access. '-' is Sign to Run Locally, not an Apple certificate.
run('/usr/bin/xcodebuild',['-project','ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','-derivedDataPath',derived,'CODE_SIGN_IDENTITY=-','CODE_SIGNING_ALLOWED=YES','DEVELOPMENT_TEAM=','SWIFT_ACTIVE_COMPILATION_CONDITIONS=DEBUG ARIZE_SIMULATOR_TEST','INFOPLIST_FILE='+fixturePlist,'-quiet','build'])
const artifact=derived+'/Build/Products/Debug-iphonesimulator/App.app'
const built=JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-',artifact+'/Info.plist'],{encoding:'utf8'}))
assert.equal(built.CFBundleIdentifier,'com.amazegen.arize.dev','Simulator artifact identity was lost during compilation')
assert.deepEqual(built.NSAppTransportSecurity,plist.NSAppTransportSecurity,'Simulator loopback transport guard was lost during compilation')
assert.equal(existsSync(artifact+'/embedded.mobileprovision'),false,'A simulator fixture must not contain an Apple provisioning profile')
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',artifact])
// codesign writes descriptive output to stderr. Inspect only public signature
// metadata; this never selects a Keychain signing key or an Apple account.
const signature=spawnSync('/usr/bin/codesign',['-d','--verbose=2',artifact],{encoding:'utf8'})
assert.equal(signature.status,0);assert.match(signature.stderr,/Signature=adhoc/);assert.match(signature.stderr,/TeamIdentifier=not set/)
const entitlements=JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-',derived+'/Build/Intermediates.noindex/App.build/Debug-iphonesimulator/App.build/App.app-Simulated.xcent'],{encoding:'utf8'}))
assert.deepEqual(entitlements,{'application-identifier':'FAKETEAMID.com.amazegen.arize.dev'},'Only Xcode\'s fictional simulator application identity is allowed')
console.log('Local connected simulator artifact: '+artifact)
