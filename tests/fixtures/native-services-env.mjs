import {execFileSync} from 'node:child_process'
import {existsSync,realpathSync} from 'node:fs'
import assert from 'node:assert/strict'
export const docker='/Applications/Docker.app/Contents/Resources/bin/docker'
export function localServices(){
 const workdir=realpathSync(process.env.ARIZE_NATIVE_SERVICES??'')
 if(!/^\/private\/tmp\/arize-native-services\.[A-Za-z0-9]+$/.test(workdir)||existsSync(workdir+'/supabase/.temp/project-ref'))throw new Error('Unlinked temporary local Supabase stack required')
 const state=JSON.parse(execFileSync('/opt/homebrew/bin/supabase',['status','--workdir',workdir,'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}))
 assert.equal(state.API_URL,'http://127.0.0.1:56581');assert.equal(new URL(state.DB_URL).hostname,'127.0.0.1');assert.equal(new URL(state.DB_URL).port,'56582')
 for(const part of ['db','kong','inbucket']){
  const value=JSON.parse(execFileSync(docker,['inspect',`supabase_${part}_arize-native-acceptance`],{encoding:'utf8'}))[0]
  assert.equal(value.Config.Labels['com.supabase.cli.project'],'arize-native-acceptance');assert.equal(value.State.Running,true)
  assert.ok(Object.values(value.NetworkSettings.Ports).filter(Boolean).every(values=>values.every(value=>value.HostIp==='127.0.0.1')))
 }
 return {API_URL:state.API_URL,ANON_KEY:state.ANON_KEY,SERVICE_ROLE_KEY:state.SERVICE_ROLE_KEY,workdir}
}
export function localSql(statement){return execFileSync(docker,['exec','-i','supabase_db_arize-native-acceptance','psql','-XAtq','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',statement],{encoding:'utf8',timeout:15000}).trim()}
