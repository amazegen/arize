import { Capacitor, registerPlugin } from '@capacitor/core'
export interface Vault { getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>;removeItem(key:string):Promise<void> }
interface KeychainPlugin { get(options:{key:string}):Promise<{value:string|null}>;set(options:{key:string;value:string}):Promise<void>;remove(options:{key:string}):Promise<void> }
const keychain=registerPlugin<KeychainPlugin>('ArizeKeychain')
export const AUTH_STORAGE_KEY='arize.native.adult.auth'
export const CONTINUITY_KEY='arize.native.adult.continuity'
export const FLOW_KEY='arize.native.adult.flow'
export function accountStorage(): Vault {
  if (Capacitor.getPlatform()==='ios') return {getItem:async key=>(await keychain.get({key})).value,setItem:async(key,value)=>{await keychain.set({key,value})},removeItem:async key=>{await keychain.remove({key})}}
  // Browser preview is memory-only. No session tokens/chats in localStorage,
  // Preferences, IndexedDB or a service-worker cache. Reload signs it out.
  const memory=new Map<string,string>()
  return {getItem:async key=>memory.get(key) ?? null,setItem:async(key,value)=>{memory.set(key,value)},removeItem:async key=>{memory.delete(key)}}
}
export async function clearAccountStorage(storage: Vault) {
  await Promise.all([AUTH_STORAGE_KEY,`${AUTH_STORAGE_KEY}-code-verifier`,CONTINUITY_KEY,FLOW_KEY].map(key=>storage.removeItem(key)))
}
