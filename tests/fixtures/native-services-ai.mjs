import {createServer} from 'node:http'
if(!process.argv.includes('--synthetic-only'))throw new Error('Local fictional AI only')
let generations=0
createServer(async(req,res)=>{
 if(req.headers.host!=='127.0.0.1:3191'){res.writeHead(403);res.end();return}
 const json=value=>{res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}
 if(req.url==='/stats')return json({generations})
 if(req.headers.authorization!=='Bearer fictional-local-ai-not-valid'){res.writeHead(403);res.end();return}
 let raw='';for await(const part of req){raw+=part;if(raw.length>50000){res.writeHead(413);res.end();return}}
 try{
  const body=JSON.parse(raw)
  if(req.url==='/v1/moderations'){const flagged=/fixture-crisis|fixture-unsafe-output/.test(String(body.input));return json({id:'fictional-mod',model:'fictional',results:[{flagged,categories:{'self-harm/intent':flagged},category_scores:{}}]})}
  if(req.url==='/v1/chat/completions'){generations++;return json({id:'fictional-completion',choices:[{message:{role:'assistant',content:'Let’s choose one small next step. What would help you today?'}}]})}
  res.writeHead(404);res.end()
 }catch{res.writeHead(400);res.end()}
}).listen(3191,'127.0.0.1',()=>console.log('Fictional AI stub on loopback 3191; no external provider used.'))
