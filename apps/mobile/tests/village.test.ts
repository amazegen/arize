import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import ts from 'typescript'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

const component=new URL('../src/features/VillageScreen.tsx',import.meta.url)
const source=readFileSync(component,'utf8')
test('Village renders a loading state, not an empty-room claim, before the first request completes',()=>{
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}})
  const exports:Record<string,unknown>={}
  const require=createRequire(component)
  // The initial list does not render child safety controls; their browser/RPC tests are separate.
  runInNewContext(compiled.outputText,{exports,require:(id:string)=>id.endsWith('/SafetyTools')?{}:require(id)})
  const html=renderToStaticMarkup(createElement(exports.VillageScreen as (props:unknown)=>ReturnType<typeof createElement>,{accounts:{}}))
  assert.match(html,/role="status">Loading rooms/)
  assert.doesNotMatch(html,/Rooms will appear|No messages yet/)
})
test('Village message empty state is success-only and stale room loads cannot overwrite a reopened room',()=>{
  assert.match(source,/messagesStatus==='loading'\?<p role="status">Loading messages/)
  assert.match(source,/messagesStatus==='error'\?<p>Messages could not load/)
  assert.match(source,/:messages\.length===0&&<p>No messages yet/)
  assert.match(source,/aria-busy=\{messagesStatus==='loading'\}/)
  assert.match(source,/roomEpoch\.current===epoch&&loadSequence\.current===sequence/)
  assert.match(source,/setMessages\(data\.messages\);setBefore\(data\.before\);setMessagesStatus\('ready'\)/)
})
test('Back navigation does not leave a room; confirmed joins update both list and open-room state',()=>{
  assert.match(source,/await accounts\.request\('\/village','POST',\{roomId:room\.id,action\}\)/)
  assert.match(source,/setRooms\(current=>current\.map\(r=>r\.id===room\.id\?updated:r\)\);openRoom\(updated\)/)
  assert.match(source,/room\.member\?'Open room':'View room'/)
  const back=source.slice(source.indexOf('return <section className="native-chat">'),source.indexOf('← All rooms'))
  assert.doesNotMatch(back,/membership\(|action:|accounts\.request/)
})
test('Shared adult safety components use one React instance in the mobile bundle',()=>{
  const config=readFileSync(new URL('../vite.config.ts',import.meta.url),'utf8')
  assert.match(config,/dedupe: \['react','react-dom'\]/)
})
