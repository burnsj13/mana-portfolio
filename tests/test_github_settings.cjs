const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const context={TextEncoder,TextDecoder,btoa,atob,fetch:()=>{throw Error('Unexpected real network')}};
vm.createContext(context);vm.runInContext(fs.readFileSync('github-settings.js','utf8'),context);
const api=context.GitHubSettings;
(async()=>{
 const settings={version:1,alerts:{enabled:true},watchlist:[{n:'Urza’s 🌟',id:'example',f:'normal'}]};
 assert.equal(api.decode(api.encode(settings)).watchlist[0].n,settings.watchlist[0].n);
 let sha='one',calls=[];
 const fake=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>options.method==='PUT'?{content:{sha:'two'},commit:{html_url:'https://github.com/example'}}:{sha,content:api.encode(settings)}}};
 const writer=api.create('jacob',fake);await writer.connect('fake-token-for-tests-only');await writer.save(settings);
 assert(calls.every(c=>c.url.startsWith('https://api.github.com/repos/burnsj13/mana-portfolio/contents/settings/jacob.json')));
 assert(calls.every(c=>c.options.redirect==='error'));
 const body=JSON.parse(calls.find(c=>c.options.method==='PUT').options.body);
 assert.equal(body.sha,'one');assert.equal(body.branch,'main');assert(!JSON.stringify(body).includes('fake-token'));
 sha='changed';await assert.rejects(writer.save(settings),/changed since connection/);
 writer.disconnect();const count=calls.length;await assert.rejects(writer.save(settings),/Connect/);assert.equal(calls.length,count);
 const expired=api.create('main',async()=>({ok:false,status:401}));await assert.rejects(expired.connect('fake'),/invalid/);
 console.log('PASS GitHub save: Unicode, profile isolation, authenticated file update, conflict detection, disconnect, no token in content');
})().catch(error=>{console.error(error);process.exitCode=1});
