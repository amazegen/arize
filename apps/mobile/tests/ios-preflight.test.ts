import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

test('simulator preflight builds only on explicit request, without signing or upload commands',()=>{
 const source=readFileSync(new URL('../scripts/check-ios.mjs',import.meta.url),'utf8')
 assert.match(source,/process\.argv\.includes\('--build'\)/)
 assert.match(source,/CODE_SIGNING_ALLOWED=NO/);assert.match(source,/CODE_SIGNING_REQUIRED=NO/)
 assert.match(source,/generic\/platform=iOS Simulator/)
 assert.match(source,/process.exitCode=2/)
 assert.doesNotMatch(source,/'-allowProvisioningUpdates'|'-exportArchive'|'-archivePath'|'altool'|'notarytool'|execFileSync\([^\n]*xcode-select/)
})
