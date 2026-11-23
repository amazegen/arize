import {useEffect,useState} from 'react'
import {Haptics,ImpactStyle} from '@capacitor/haptics'
import {nativeIOS} from '../reminders'
const steps=[{title:'Notice your space',text:'Look around at your own pace. Name three things you can see. You do not need to close your eyes.'},{title:'Find one point of support',text:'If it feels comfortable, notice your feet on the floor or the chair beneath you. You can also focus on a nearby object.'},{title:'Choose one small next step',text:'What would make the next few minutes a little easier? A sip of water, a stretch or a quick break can be enough.'}]
export function GroundingScreen({onBack}:{onBack:()=>void}){
 const [step,setStep]=useState(0),[complete,setComplete]=useState(false)
 useEffect(()=>{document.querySelector('h1')?.focus()},[step,complete])
 async function next(){if(nativeIOS())await Haptics.impact({style:ImpactStyle.Light}).catch(()=>undefined);if(step<2)setStep(value=>value+1);else setComplete(true)}
 return <section><button className="text-button back" onClick={onBack}>← Back to my space</button><p className="eyebrow">OFFLINE · A MOMENT FOR YOU</p><h1 tabIndex={-1}>{complete?'A small pause counts.':steps[step].title}</h1><p className="intro">{complete?'Take what helped and leave the rest. You can come back whenever you need a moment.':steps[step].text}</p><div className="grounding-orb" aria-hidden="true">✺</div><p className="progress" aria-live="polite">{complete?'Exercise complete':`Step ${step+1} of 3`}</p><button className="primary full" onClick={complete?onBack:next}>{complete?'Back to my space':step===2?'Finish':'Next step'}</button>{!complete&&<button className="text-button full" onClick={next}>Skip this step</button>}</section>
}
