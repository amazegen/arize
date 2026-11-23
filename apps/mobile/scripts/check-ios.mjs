// No signing, archive, portal access, upload, global xcode-select or license acceptance.
import {execFileSync,spawnSync} from 'node:child_process'
import {existsSync,mkdtempSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url))
const candidates=[process.env.DEVELOPER_DIR,'/Applications/Xcode.app/Contents/Developer'].filter(Boolean)
const developer=candidates.find(path=>existsSync(path+'/usr/bin/xcodebuild')&&existsSync(path+'/Platforms/iPhoneSimulator.platform'))
if(!developer){console.error('BLOCKED: Full Xcode 26+ with the iOS Simulator SDK is required. Install/open Xcode and complete Apple’s prompts yourself. Command Line Tools cannot compile this iOS app.');process.exitCode=2}
else{
 const env={...process.env,DEVELOPER_DIR:developer}
 try{
  const version=execFileSync('/usr/bin/xcodebuild',['-version'],{env,encoding:'utf8'})
  const major=Number(version.match(/Xcode (\d+)/)?.[1])
  if(!Number.isFinite(major)||major<26)throw new Error('Capacitor 8 requires Xcode 26 or later.')
  execFileSync('/usr/bin/xcrun',['--find','simctl'],{env,stdio:'pipe'})
  const runtimes=JSON.parse(execFileSync('/usr/bin/xcrun',['simctl','list','runtimes','--json'],{env,encoding:'utf8'})).runtimes
  if(!runtimes.some(runtime=>runtime.isAvailable&&runtime.identifier.includes('iOS')))throw new Error('Install an available iOS Simulator runtime in Xcode.')
  console.log('PASS: full Xcode, Simulator SDK and available iOS runtime detected. Nothing signed or uploaded.')
  if(process.argv.includes('--build')){
   const derived=mkdtempSync('/private/tmp/arize-ios-simulator-build.')
   const result=spawnSync('/usr/bin/xcodebuild',['-project','ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','-derivedDataPath',derived,'CODE_SIGNING_ALLOWED=NO','CODE_SIGNING_REQUIRED=NO','build'],{cwd:root,env,stdio:'inherit'})
   process.exitCode=result.status??1
  }
 }catch(error){console.error('BLOCKED: '+error.message);process.exitCode=2}
}
