import { useCallback, useEffect, useRef, useState } from 'react'
import { App as NativeLifecycle } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import type { NativeSession } from '../../../../lib/native/contracts'
import { AccountError, type Accounts } from './client'
import { CONTINUITY_KEY } from './storage'

export function useAccounts(accounts:Accounts){
  const [session,setSession]=useState<NativeSession|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[recovery,setRecovery]=useState(false),[active,setActive]=useState(true),[linkBusy,setLinkBusy]=useState(false)
  const revision=useRef(0),owner=useRef<string|null>(null),mounted=useRef(true),lastLink=useRef('')
  const refresh=useCallback(async()=>{
    const ticket=++revision.current
    try{
      const result=await accounts.client.auth.getSession()
      if(result.error)throw new Error('Your saved session could not be restored. Sign in again.')
      if(ticket!==revision.current||!mounted.current)return
      if(!result.data.session){if(ticket===revision.current&&mounted.current){setSession(null);owner.current=null;setLoading(false)}return}
      const data=await accounts.session()
      if(ticket===revision.current&&mounted.current){owner.current=data.user.id;setSession(data);setLoading(false);setError('')}
    }catch(caught){if(ticket===revision.current&&mounted.current){setLoading(false);setError(caught instanceof Error?caught.message:'Account services unavailable.');if(caught instanceof AccountError&&caught.status===401){setSession(null);owner.current=null;await accounts.signOut().catch(()=>undefined)}}}
  },[accounts])
  useEffect(()=>{
    mounted.current=true
    const listener=accounts.client.auth.onAuthStateChange((event,next)=>{
      if(event==='SIGNED_OUT'){revision.current++;accounts.clearPrivate();owner.current=null;setSession(null);setRecovery(false);setLoading(false);void accounts.storage.removeItem(CONTINUITY_KEY).catch(()=>setError('Secure cleanup failed. Unlock your device and sign out again.'))}
      else {if(next?.user.id!==owner.current){accounts.clearPrivate();setSession(null);setLoading(true)}queueMicrotask(()=>{if(mounted.current)void refresh()})}
    })
    return()=>{mounted.current=false;listener.data.subscription.unsubscribe();accounts.clearPrivate()}
  },[accounts,refresh])
  useEffect(()=>{
    let alive=true
    async function link(url:string){
      if(lastLink.current===url)return;lastLink.current=url;setLinkBusy(true)
      try{const purpose=await accounts.handleLink(url);if(alive){setRecovery(purpose==='recovery');await refresh()}}
      catch(caught){if(alive)setError(caught instanceof Error?caught.message:'This account link could not be opened.')}
      finally{if(alive)setLinkBusy(false)}
    }
    function visibility(isActive:boolean){
      if(!alive)return
      setActive(isActive)
      if(isActive){accounts.client.auth.startAutoRefresh();void refresh()}
      else{revision.current++;accounts.client.auth.stopAutoRefresh();accounts.clearPrivate()}
    }
    const onVisible=()=>visibility(document.visibilityState==='visible')
    const native=Capacitor.getPlatform()==='ios'
    const stateListener=native?NativeLifecycle.addListener('appStateChange',state=>visibility(state.isActive)):null
    const urlListener=native?NativeLifecycle.addListener('appUrlOpen',event=>{void link(event.url)}):null
    if(native)void NativeLifecycle.getLaunchUrl().then(value=>{if(alive&&value?.url)void link(value.url)})
    else document.addEventListener('visibilitychange',onVisible)
    return()=>{alive=false;document.removeEventListener('visibilitychange',onVisible);void stateListener?.then(h=>h.remove());void urlListener?.then(h=>h.remove())}
  },[accounts,refresh])
  async function signOut(){revision.current++;accounts.clearPrivate();setSession(null);owner.current=null;try{await accounts.signOut();setError('')}catch{setError('Signed out here, but remote sign-out or secure cleanup could not be confirmed. Unlock and retry.')}finally{setLoading(false);setRecovery(false)}}
  return {session,loading,error,recovery,active,linkBusy,refresh,signOut,setError}
}
