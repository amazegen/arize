import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Accounts } from './client'
import type { NativeSession } from '../../../../lib/native/contracts'
import { PRIVACY_URL, TERMS_URL } from '../../../../lib/legal/consent'

export function AuthScreen({accounts,onDone,recovery=false}:{accounts:Accounts;onDone:()=>Promise<void>;recovery?:boolean}) {
  const [mode,setMode]=useState<'signin'|'signup'|'reset'>('signin')
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState('')
  const [agreed,setAgreed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
  async function submit(event:FormEvent) {
    event.preventDefault();setBusy(true);setNotice('')
    try {
      if (recovery) {
        const result=await accounts.client.auth.updateUser({password});if(result.error)throw new Error('The new password could not be saved. Restart password reset if the link expired.')
        setPassword('');await accounts.signOut();await onDone();setNotice('Password saved. Sign in with your new password.')
      } else if (mode==='signin') {
        const result=await accounts.client.auth.signInWithPassword({email:email.trim(),password});if(result.error)throw new Error('Check your email/password and confirm your email first. You can also reset your password.')
        setPassword('');await onDone()
      } else if (mode==='signup') {
        if(!agreed)throw new Error('Review and agree to the Terms and Privacy Policy first.')
        await accounts.beginFlow('signup')
        const result=await accounts.client.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:accounts.config.callback,data:{full_name:name.trim()}}})
        if(result.error){await accounts.cancelFlow();throw new Error('Signup could not finish. Try again, or sign in/reset your password if you already have an account.')}
        setPassword('');setNotice('Check your email for the account confirmation link. Open it on this same device. If you already have an account, use Sign in or Forgot password.');if(result.data.session)await onDone()
      } else {
        await accounts.beginFlow('recovery')
        const result=await accounts.client.auth.resetPasswordForEmail(email.trim(),{redirectTo:accounts.config.callback})
        if(result.error){await accounts.cancelFlow();throw new Error('The reset request could not be sent. Please try again later.')}
        setNotice('If an account exists, a reset link will be sent. Open it on this same device in Arize, choose a new password, then sign in.');
      }
    } catch(error){setNotice(error instanceof Error?error.message:'Account services are unavailable.')}finally{setBusy(false)}
  }
  return <section className="account-page"><p className="eyebrow">YOUR ARIZE ACCOUNT</p><h1 tabIndex={-1}>{recovery?'Choose a new password':mode==='signup'?'Make space for you.':mode==='reset'?'Reset your password':'Welcome back.'}</h1>
    <p className="intro">{recovery?'After saving, sign in again with your new password.':mode==='signup'?'Use one account for the adult website and this app.':'Sign in with your existing adult Arize account.'}</p>
    <form className="settings-card account-form" onSubmit={submit} aria-busy={busy}>
      {mode==='signup'&&!recovery&&<label>Your name<input autoComplete="name" value={name} maxLength={100} required onChange={e=>setName(e.target.value)}/></label>}
      {!recovery&&<label>Email<input type="email" autoComplete="email" value={email} required maxLength={254} onChange={e=>setEmail(e.target.value)}/></label>}
      {(mode!=='reset'||recovery)&&<label>Password<input type="password" autoComplete={recovery||mode==='signup'?'new-password':'current-password'} value={password} required minLength={recovery||mode==='signup'?12:1} maxLength={1024} onChange={e=>setPassword(e.target.value)}/></label>}
      {mode==='signup'&&!recovery&&<label className="check-row"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} required/><span>I agree to the <a href={TERMS_URL} target="_blank" rel="noreferrer">Terms</a> and <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label>}
      <button className="primary full" disabled={busy}>{busy?'Working…':recovery?'Save new password':mode==='signin'?'Sign in':mode==='signup'?'Create account':'Send reset link'}</button>
      {accounts.config.google&&!recovery&&mode==='signin'&&<button className="secondary full" type="button" disabled={busy} onClick={()=>{setBusy(true);void accounts.google().catch(error=>setNotice(error.message)).finally(()=>setBusy(false))}}>Continue with Google</button>}
      <p role="status">{notice}</p>
    </form>
    {!recovery&&<div className="account-switches"><button className="text-button" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setNotice('');setPassword('')}}>{mode==='signin'?'Create an account':'Already have an account? Sign in'}</button><button className="text-button" onClick={()=>{setMode('reset');setNotice('');setPassword('')}}>Forgot password?</button><button className="text-button" onClick={()=>{void accounts.cancelFlow().then(()=>setNotice('Previous account link canceled. You can start again.'))}}>Cancel a previous account link</button></div>}
  </section>
}
export function MfaScreen({accounts,onDone}:{accounts:Accounts;onDone:()=>Promise<void>}) {
  const [code,setCode]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  async function verify(event:FormEvent){event.preventDefault();setBusy(true);try{const factors=await accounts.client.auth.mfa.listFactors();const factor=factors.data?.totp.find(f=>f.status==='verified');if(!factor)throw new Error('This account uses another verification method. Use the adult website until its native flow is available.');const result=await accounts.client.auth.mfa.challengeAndVerify({factorId:factor.id,code});if(result.error)throw new Error('That verification code was not accepted.');setCode('');await onDone()}catch(error){setNotice(error instanceof Error?error.message:'Verification unavailable.')}finally{setBusy(false)}}
  return <section><h1 tabIndex={-1}>Verify it’s you</h1><p className="intro">Enter the current six-digit code from your authenticator app.</p><form className="settings-card account-form" onSubmit={verify}><label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} required maxLength={6} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label><button className="primary full" disabled={busy}>Verify</button><p role="status">{notice}</p></form></section>
}
export function SetupScreen({accounts,session,onDone}:{accounts:Accounts;session:NativeSession;onDone:()=>Promise<void>}){
  const [name,setName]=useState(session.profile.name??''),[username,setUsername]=useState(session.profile.username??''),[agreed,setAgreed]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);try{if(!session.consented){if(!agreed)throw new Error('Confirm your agreement first.');await accounts.request('/legal','POST',{accepted:true})}await accounts.request('/account','PATCH',{name,username});await onDone()}catch(error){setNotice(error instanceof Error?error.message:'Setup could not be saved.')}finally{setBusy(false)}}
  return <section><h1 tabIndex={-1}>Make this space yours.</h1><p className="intro">Choose how you appear in the adult app and Village.</p><form className="settings-card account-form" onSubmit={submit} aria-busy={busy}><label>Display name<input autoComplete="name" value={name} maxLength={100} required onChange={e=>setName(e.target.value)}/></label><label>Username (optional)<input autoComplete="username" value={username} maxLength={30} onChange={e=>setUsername(e.target.value)}/></label>{!session.consented&&<label className="check-row"><input type="checkbox" required checked={agreed} onChange={e=>setAgreed(e.target.checked)}/><span>I agree to the <a href={TERMS_URL} target="_blank" rel="noreferrer">Terms</a> and <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label>}<button className="primary full" disabled={busy}>{busy?'Saving…':'Continue'}</button><p role="status">{notice}</p></form></section>
}
