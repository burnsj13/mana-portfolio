const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const context={Request,Response,FormData,Blob,URL,AbortSignal,Deno:{serve:()=>{}}};vm.createContext(context);
vm.runInContext(fs.readFileSync('supabase/functions/send-discord-summary/index.ts','utf8').replace('export async function handler','async function handler'),context);
const env={get:name=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'SERVER_SECRET',DISCORD_WEBHOOK_MAIN:'https://discord.com/api/webhooks/123/MAIN_SECRET',DISCORD_WEBHOOK_JACOB:'https://discord.com/api/webhooks/123/JACOB_SECRET'})[name]};
const call=collection=>new Request('https://test.supabase.co/functions/v1/send-discord-summary',{method:'POST',body:JSON.stringify({collection})});
let claimed=true,storageReady=true;const calls=[];
async function fake(url,options){calls.push({url,options});
 if(url.includes('/rpc/'))return Response.json(claimed);
 if(url.endsWith('discord-summary.json'))return storageReady?Response.json({content:'Saved total and movers',checkedAt:'2026-10-19'}):new Response(null,{status:404});
 if(url.endsWith('.png'))return new Response('PNG',{headers:{'Content-Type':'image/png'}});
 if(url.startsWith('https://discord.com/')){const payload=JSON.parse(options.body.get('payload_json'));assert.equal(payload.content,'Saved total and movers');assert.equal(payload.allowed_mentions.parse.length,0);assert(options.body.get('files[0]'));assert(!options.headers);return Response.json({id:'sent'})}
 throw Error('Unexpected request');
}
(async()=>{
 let r=await context.handler(call('jacob'),fake,env);assert.equal(r.status,200);assert(calls.at(-1).url.includes('JACOB_SECRET'));assert(calls.some(c=>c.url.includes('/jacob/discord-graph.png')));assert(!JSON.stringify(await r.json()).includes('SECRET'));
 const count=calls.length;r=await context.handler(call('unknown'),fake,env);assert.equal(r.status,400);assert.equal(calls.length,count);
 claimed=false;r=await context.handler(call('main'),fake,env);assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');assert.equal(calls.length,count+1);
 claimed=true;storageReady=false;r=await context.handler(call('main'),fake,env);assert.equal(r.status,503);
 r=await context.handler(call('main'),fake,{get:()=>undefined});assert.equal(r.status,503);
 r=await context.handler(new Request('https://test/',{method:'OPTIONS'}),fake,env);assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');
 console.log('PASS public Discord sends without user/GitHub auth, fixed profile routing, private graph upload, cooldown and sanitized failures');
})().catch(e=>{console.error(e);process.exitCode=1});
