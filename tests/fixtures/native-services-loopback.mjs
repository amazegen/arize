// Supabase CLI v2 explicitly publishes to all interfaces. Run only against the
// NEW named fictional stack, before loading records; preserve its local volumes.
import http from 'node:http'
import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
if(!process.argv.includes('--synthetic-only'))throw new Error('Explicit fictional local stack only')
const docker='/Applications/Docker.app/Contents/Resources/bin/docker'
const socket=execFileSync(docker,['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'}).trim().replace(/^unix:\/\//,'')
if(!socket.endsWith('/.docker/run/docker.sock'))throw new Error('Local Docker Desktop socket required')
async function engine(path,body){return new Promise((resolve,reject)=>{const req=http.request({socketPath:socket,path,method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{}},res=>{let raw='';res.on('data',part=>raw+=part);res.on('end',()=>{if(res.statusCode>=300)return reject(new Error(`Docker local operation failed (${res.statusCode})`));resolve(raw?JSON.parse(raw):{})})});req.on('error',reject);if(body)req.write(JSON.stringify(body));req.end()})}
for(const part of ['db','kong','inbucket',...(process.argv.includes('--enable-local-totp')?['auth']:[])]){
 const name=`supabase_${part}_arize-native-acceptance`
 const original=await engine(`/containers/${name}/json`)
 assert.equal(original.Config.Labels['com.supabase.cli.project'],'arize-native-acceptance')
 assert.equal(original.HostConfig.NetworkMode,'arize-native-acceptance-loopback')
 const bindings=original.HostConfig.PortBindings??{}
 const envChanges=part==='auth'&&original.Config.Env.some(value=>/^GOTRUE_MFA_TOTP_(ENROLL|VERIFY)_ENABLED=false$/.test(value))
 if(Object.values(bindings).every(values=>values.every(value=>value.HostIp==='127.0.0.1'))&&!envChanges){if(!original.State.Running)execFileSync(docker,['start',name]);continue}
 if(original.State.Running)throw new Error('Stop only the named test container before changing its test configuration')
 if(envChanges)original.Config.Env=original.Config.Env.map(value=>value.replace(/^GOTRUE_MFA_TOTP_(ENROLL|VERIFY)_ENABLED=false$/,(_,kind)=>`GOTRUE_MFA_TOTP_${kind}_ENABLED=true`))
 for(const values of Object.values(bindings))for(const value of values)value.HostIp='127.0.0.1'
 const archived=`${name}-unpublished-original`
 execFileSync(docker,['rename',name,archived])
 try{
  await engine(`/containers/create?name=${name}`,{...original.Config,HostConfig:{...original.HostConfig,PortBindings:bindings},NetworkingConfig:{EndpointsConfig:{'arize-native-acceptance-loopback':{Aliases:[name]}}}})
  execFileSync(docker,['start',name])
 }catch(error){throw new Error(`Local rebind failed for ${name}; original retained as ${archived}`,{cause:error})}
 const checked=await engine(`/containers/${name}/json`)
 assert.ok(Object.values(checked.NetworkSettings.Ports).filter(Boolean).every(values=>values.every(value=>value.HostIp==='127.0.0.1')))
 console.log(`${name}: localhost only; original stopped container retained.`)
}
