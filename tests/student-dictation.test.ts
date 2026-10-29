import test from "node:test";
import assert from "node:assert/strict";
import { dictationText, dictationError, getSpeechConstructor, startDictation, type SpeechEngine, type SpeechResultEvent } from "../lib/student/dictation.ts";
class FakeSpeech implements SpeechEngine {
  static last: FakeSpeech;
  lang=""; continuous=false; interimResults=false;
  onresult: ((e: SpeechResultEvent) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started=false; stopped=false; aborted=false;
  constructor(){FakeSpeech.last=this;}
  start(){this.started=true;}
  stop(){this.stopped=true;this.onend?.();}
  abort(){this.aborted=true;this.onend?.();}
}
test("dictation detects standard and prefixed browser support without requesting a microphone", () => {
  assert.equal(getSpeechConstructor({SpeechRecognition:FakeSpeech}),FakeSpeech);
  assert.equal(getSpeechConstructor({webkitSpeechRecognition:FakeSpeech}),FakeSpeech);
  assert.equal(getSpeechConstructor({}),null);assert.equal(getSpeechConstructor(null),null);
});
test("dictation appends to an editable draft and respects the chat limit",()=>{
  assert.equal(dictationText("My draft","new words"),"My draft new words");
  assert.equal(dictationText("My draft ","new words"),"My draft new words");
  assert.equal(dictationText("Existing","  "),"Existing");
  assert.equal(dictationText("a".repeat(1998),"new words").length,2000);
});
test("dictation handles interim replacements without duplicating text or sending a chat",()=>{
  const texts:string[]=[];let ended=0;
  const session=startDictation(FakeSpeech,{base:"Draft",language:"es",onText:t=>texts.push(t),onEnd:()=>ended++,onError:()=>assert.fail()});
  const engine=FakeSpeech.last;
  assert.equal(engine.lang,"es-US");assert.equal(engine.started,true);
  engine.onresult?.({results:[{0:{transcript:"hola"},isFinal:false}]});
  engine.onresult?.({results:[{0:{transcript:"hola mundo"},isFinal:true}]});
  assert.deepEqual(texts,["Draft hola","Draft hola mundo"]);
  session.stop();assert.equal(ended,1);session.cancel();assert.equal(ended,1);assert.equal(engine.aborted,true);
});
test("microphone denial ends listening and provides useful bilingual guidance",()=>{
  let ended=0;let code="";
  const session=startDictation(FakeSpeech,{base:"",language:"en",onText:()=>assert.fail(),onEnd:()=>ended++,onError:v=>code=v});
  FakeSpeech.last.onerror?.({error:"not-allowed"});
  assert.equal(code,"not-allowed");assert.equal(ended,1);assert.equal(FakeSpeech.last.aborted,true);
  assert.match(dictationError(code,"en"),/permissions/);assert.match(dictationError(code,"es"),/permisos/);session.cancel();
});
test("dictation has a bounded listening duration and cancels safely on unmount",async()=>{
  let ended=0;const text:string[]=[];
  const session=startDictation(FakeSpeech,{base:"",language:"en",onText:v=>text.push(v),onEnd:()=>ended++,onError:()=>assert.fail(),durationMs:10});
  await new Promise(resolve=>setTimeout(resolve,25));assert.equal(FakeSpeech.last.stopped,true);assert.equal(ended,1);
  session.cancel();FakeSpeech.last.onresult?.({results:[{0:{transcript:"late"},isFinal:true}]});assert.deepEqual(text,[]);
});
