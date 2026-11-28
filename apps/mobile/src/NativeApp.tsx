import { useEffect,useState } from 'react'
import type { Accounts } from './account/client'
import { useAccounts } from './account/useAccounts'
import { AuthScreen,MfaScreen,SetupScreen } from './account/AuthScreens'
import { ProfileScreen } from './account/ProfileScreen'
import { GoalsScreen } from './features/GoalsScreen'
import { ClarityScreen } from './features/ClarityScreen'
import { VillageScreen } from './features/VillageScreen'
import { GroundingScreen } from './features/GroundingScreen'
import { PRIVACY_URL,TERMS_URL } from '../../../lib/legal/consent'

export function NativeApp({accounts}:{accounts:Accounts}){
  const auth=useAccounts(accounts),[screen,setScreen]=useState<'home'|'goals'|'clarity'|'village'|'profile'|'grounding'>('home')
  useEffect(()=>{document.querySelector('h1')?.focus()},[screen,auth.session?.user.id])
  const session=auth.session,ready=session&&!auth.recovery&&!session.needsMfa&&!session.deleting&&session.consented&&session.profile.onboarded
  const hour=new Date().getHours(),greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening'
  return <div className={`mobile-shell connected-native ${screen==='clarity'||screen==='village'?'chat-shell':''}`}>
    <header><button className="brand" aria-label="Arize home" onClick={()=>setScreen('home')}><img src="./logo.png" alt=""/><span>Arize</span></button><span className="edition">ADULT EDITION</span></header>
    <div className="foundation-note">{accounts.config.localTest?'Local review · fictional accounts only':'Native review build'}<br/><span>No purchases. Student is a separate app.</span></div>
    {!auth.active?<main><h1 tabIndex={-1}>Your space is paused.</h1><p>Return to Arize to refresh your private information.</p></main>:auth.loading||auth.linkBusy?<main><p role="status">Restoring your secure account…</p></main>:<main id="main" key={session?.user.id??'signed-out'}>
      {auth.error&&<div className="notice" role="alert"><p>{auth.error}</p><button className="text-button" onClick={()=>{void auth.refresh()}}>Retry account check</button></div>}
      {screen==='grounding'?<GroundingScreen onBack={()=>setScreen('home')}/>:!session||auth.recovery?<><AuthScreen accounts={accounts} onDone={auth.refresh} recovery={auth.recovery}/><button className="text-button" onClick={()=>setScreen('grounding')}>Take an offline pause</button></>:session.needsMfa?<MfaScreen accounts={accounts} onDone={auth.refresh}/>:session.deleting?<ProfileScreen accounts={accounts} session={session} onRefresh={auth.refresh} onSignOut={auth.signOut}/>:!ready?(screen==='profile'?<ProfileScreen accounts={accounts} session={session} onRefresh={auth.refresh} onSignOut={auth.signOut}/>:<SetupScreen accounts={accounts} session={session} onDone={auth.refresh}/>):<>
        {screen==='home'&&<section><p className="eyebrow">YOUR SPACE, YOUR PACE</p><h1 tabIndex={-1}>{greeting},<br/>{session.profile.name?.trim().split(/\s+/)[0]||'friend'}.</h1><p className="intro">One adult account. Your goals, conversations and community.</p><section className="feature-card"><span className="sun" aria-hidden="true">☀</span><h2>One small next step</h2><p>Return to your goals, or make a little space to talk it through.</p><button className="primary" onClick={()=>setScreen('goals')}>Open my goals →</button></section><div className="home-links"><button className="small-card" onClick={()=>setScreen('clarity')}><h2>Clarity</h2><p>Start or continue a saved chat.</p></button><button className="small-card" onClick={()=>setScreen('village')}><h2>Village</h2><p>Connect in your community rooms.</p></button></div></section>}
        {screen==='goals'&&<GoalsScreen accounts={accounts}/>}{screen==='clarity'&&<ClarityScreen accounts={accounts} aiConsented={session.aiConsented} onRefresh={auth.refresh}/>}{screen==='village'&&<VillageScreen accounts={accounts} userId={session.user.id}/>}{screen==='profile'&&<ProfileScreen accounts={accounts} session={session} onRefresh={auth.refresh} onSignOut={auth.signOut}/>}
      </>}
      {ready&&screen==='home'&&<button className="text-button" onClick={()=>setScreen('grounding')}>Take an offline pause</button>}
      {session&&!ready&&!session.deleting&&<div className="row-actions"><button className="text-button" onClick={()=>{void auth.signOut()}}>Sign out</button><button className="text-button" onClick={()=>setScreen('profile')}>Delete account instead</button></div>}
    </main>}
    <footer><p>Not an emergency service. Nobody watches Clarity live.</p><p>In immediate danger, call <a href="tel:911">911</a>. In the U.S., call or text <a href="tel:988">988</a> for crisis support.</p><p><a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy policy</a> · <a href={TERMS_URL} target="_blank" rel="noreferrer">Terms of use</a></p></footer>
    {ready&&auth.active&&<nav aria-label="Main navigation">{(['home','goals','clarity','village','profile'] as const).map((item,i)=><button key={item} aria-current={screen===item?'page':undefined} onClick={()=>setScreen(item)}><span aria-hidden="true">{['⌂','✓','✦','♧','⚙'][i]}</span>{item[0].toUpperCase()+item.slice(1)}</button>)}</nav>}
  </div>
}
