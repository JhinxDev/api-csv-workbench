import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProvider, fixturePage } from '../src/provider.mjs';
import { run } from '../src/engine.mjs';
import { makePlan } from '../src/plan.mjs';
import { openStore, exportRun } from '../src/store.mjs';
import { envelope } from '../src/errors.mjs';
async function server(handler, body) {
  const requests=[];
  const s=createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1');requests.push({url:u,headers:req.headers});handler(req,res,u,requests.length);});
  await new Promise((yes,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',yes);});
  try{return await body(`http://127.0.0.1:${s.address().port}`,requests);}
  finally{s.closeAllConnections();await new Promise(yes=>s.close(yes));}
}
const json=(res,code,body,headers={})=>{res.writeHead(code,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(body));};
const page=(u)=>fixturePage(u.searchParams.get('query'),Number(u.searchParams.get('page')),Number(u.searchParams.get('per_page')));
const opts=(url,extra={})=>({kind:'local-http',localUrl:url,maxRetries:0,...extra});
test('real HTTP builds encoded search, account preflight and pagination without key leakage', async()=>{
  const old=process.env.PUBLICWWW_API_KEY;process.env.PUBLICWWW_API_KEY='fake-real-key-never-local';
  try{await server((req,res,u)=>json(res,200,u.pathname==='/v1/account'?{limits:{max_per_page:100}}:page(u)),async(url,requests)=>{
    const p=createProvider(opts(url));assert.equal((await p.account()).maxPerPage,100);
    const query='"Montréal" "demo+widget.js"';const result=await p.search(query,2,2);assert.equal(result.results.length,1);
    assert.equal(requests[1].url.searchParams.get('query'),query);assert.equal(requests[1].url.pathname,'/v1/search');
    assert.equal(requests[1].url.searchParams.get('format'),'json');assert.equal(requests[1].url.searchParams.has('snippets'),false);
    for(const r of requests)assert.equal(r.headers.authorization,undefined);
  });}finally{if(old===undefined)delete process.env.PUBLICWWW_API_KEY;else process.env.PUBLICWWW_API_KEY=old;}
});
for(const status of [401,403])test('auth/plan '+status+' stops without retry or reflected message',async()=>{
  await server((req,res)=>json(res,status,{error:{code:'invalid_key',message:'Bearer secret-should-not-print'}}),async(url,requests)=>{
    await assert.rejects(createProvider(opts(url,{maxRetries:2})).search('x',1,2),e=>{assert.equal(e.code,'AUTH_REJECTED');assert.ok(!JSON.stringify(envelope(e)).includes('secret'));return true;});assert.equal(requests.length,1);
  });
});
test('429 rate retry honors Retry-After and remains bounded',async()=>{
  const waits=[];await server((req,res,u,n)=>n===1?json(res,429,{error:{code:'too_many_requests',retry_after:2}},{'Retry-After':'2'}):json(res,200,page(u)),async(url,requests)=>{
    const p=createProvider(opts(url,{maxRetries:1,delay:async ms=>waits.push(ms)}));assert.equal((await p.search('x',1,2)).returned,2);assert.deepEqual(waits,[2000]);assert.equal(requests.length,2);
  });
});
for(const code of ['quota_exceeded','snippet_quota_exceeded'])test('daily '+code+' never sleeps/retries',async()=>{
  await server((req,res)=>json(res,429,{error:{code,retry_after:86400}}),async(url,requests)=>{
    await assert.rejects(createProvider(opts(url,{maxRetries:2,delay:()=>assert.fail('must not wait')})).search('x',1,2),{code:'QUOTA_EXHAUSTED'});assert.equal(requests.length,1);
  });
});
test('long rate delay stops for later resume',async()=>{
  await server((req,res)=>json(res,429,{error:{code:'too_many_requests',retry_after:60}}),async url=>{
    await assert.rejects(createProvider(opts(url,{maxRetries:2,maxWaitMs:1000})).search('x',1,2),{code:'RATE_LIMITED'});
  });
});
test('5xx bounded retries and permanent 400 classification',async()=>{
  await server((req,res)=>json(res,503,{error:{code:'temporary'}}),async(url,requests)=>{
    await assert.rejects(createProvider(opts(url,{maxRetries:2,delay:async()=>{}})).search('x',1,2),{code:'PROVIDER_ERROR'});assert.equal(requests.length,3);
  });
  await server((req,res)=>json(res,400,{error:{code:'per_page_too_large'}}),async(url,requests)=>{
    await assert.rejects(createProvider(opts(url,{maxRetries:2})).search('x',1,2),{code:'PROVIDER_ERROR'});assert.equal(requests.length,1);
  });
});
for(const mode of ['malformed','inconsistent','html','oversized','redirect','timeout'])test('real HTTP refuses '+mode,async()=>{
  const expected={malformed:'INVALID_RESPONSE',inconsistent:'INVALID_RESPONSE',html:'INVALID_RESPONSE',oversized:'RESPONSE_TOO_LARGE',redirect:'REDIRECT_REFUSED',timeout:'NETWORK_FAILURE'};
  await server((req,res,u)=>{
    if(mode==='timeout')return;
    if(mode==='redirect'){res.writeHead(302,{Location:'https://example.test/'});res.end();}
    else if(mode==='html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<html>');}
    else if(mode==='malformed'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{');}
    else if(mode==='oversized'){res.writeHead(200,{'Content-Type':'application/json'});res.end(' '.repeat(10000));}
    else json(res,200,{...page(u),returned:999});
  },async url=>await assert.rejects(createProvider(opts(url,{timeoutMs:40,maxBytes:2000})).search('x',1,2),{code:expected[mode]}));
});
test('fixed live origin and bearer auth; reflected secret rejected without persisted/logged data',async()=>{
  const original=globalThis.fetch,old=process.env.PUBLICWWW_API_KEY;process.env.PUBLICWWW_API_KEY='test-only-bearer-never-commit';let seen;
  globalThis.fetch=async(url,options)=>{seen={url,options};return new Response(JSON.stringify({error:{code:'invalid_key',message:process.env.PUBLICWWW_API_KEY}}),{status:401,headers:{'Content-Type':'application/json'}});};
  try{await assert.rejects(createProvider({kind:'publicwww',maxRetries:0}).search('q',1,2),e=>{assert.equal(e.code,'SECRET_REFLECTION');assert.ok(!JSON.stringify(envelope(e)).includes(process.env.PUBLICWWW_API_KEY));return true;});
    assert.equal(seen.url.origin,'https://api.publicwww.com');assert.equal(seen.options.headers.Authorization,'Bearer test-only-bearer-never-commit');assert.equal(seen.options.redirect,'manual');
  }finally{globalThis.fetch=original;if(old===undefined)delete process.env.PUBLICWWW_API_KEY;else process.env.PUBLICWWW_API_KEY=old;}
});
test('local mode refuses alternate hosts, HTTPS and credentials',()=>{
  for(const url of ['https://127.0.0.1','http://localhost','http://example.test','http://user:pass@127.0.0.1','http://127.0.0.1/path'])assert.throws(()=>createProvider(opts(url)),{code:'INVALID_LOCAL_ORIGIN'});
});
function input(dir){const l=join(dir,'locations.csv'),f=join(dir,'footprints.csv');writeFileSync(l,'location_id,location\none,Montréal\n');writeFileSync(f,'footprint_id,template\nwidget,{location} demo\n');return {locations:l,footprints:f};}
test('loopback quota interruption resumes committed page and produces complete deduplicated output',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'api-csv-http-')),db=join(dir,'run.sqlite'),p=makePlan({...input(dir),provider:'local-http'});let quota=true;
  await server((req,res,u)=>{
    if(u.pathname==='/v1/account')return json(res,200,{limits:{max_per_page:100}});
    if(quota&&u.searchParams.get('page')==='2')return json(res,429,{error:{code:'quota_exceeded'}});
    json(res,200,page(u));
  },async url=>{
    const first=await run(p,{db,localUrl:url,providerOptions:{maxRetries:0}});assert.equal(first.state,'partial');assert.equal(first.reason,'QUOTA_EXHAUSTED');assert.equal(first.matches,2);
    quota=false;const last=await run(p,{db,resume:true,localUrl:url});assert.equal(last.state,'complete');assert.equal(last.domains,3);assert.equal(last.matches,3);
    const s=openStore(db);const output=exportRun(s,join(dir,'export'));s.close();assert.match(readFileSync(join(output.directory,'run-summary.json'),'utf8'),/"complete"/);
  });
});
test('provider truncation and plan depth are explicit partial coverage',async()=>{
  for(const truncated of [true,false]){
    const dir=mkdtempSync(join(tmpdir(),'api-csv-http-')),db=join(dir,'run.sqlite'),p=makePlan({...input(dir),provider:'local-http'});
    await server((req,res,u)=>json(res,200,u.pathname==='/v1/account'?{limits:{max_per_page:2}}:{...page(u),truncated}),async url=>{
      const s=await run(p,{db,localUrl:url});assert.equal(s.state,'partial');assert.equal(s.queryStates.partial,1);assert.equal(s.requests,2);
      const st=openStore(db);assert.equal(st.db.prepare('SELECT reason FROM queries').get().reason,truncated?'PROVIDER_TRUNCATED':'DEPTH_LIMIT');st.close();
    });
  }
});
test('hard attempt budget accounts for account preflight and retries; partial state retained',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'api-csv-http-')),db=join(dir,'run.sqlite'),p=makePlan({...input(dir),provider:'local-http',maxPages:2,maxRequests:2});
  await server((req,res,u)=>json(res,200,u.pathname==='/v1/account'?{limits:{max_per_page:100}}:page(u)),async(url,requests)=>{
    const s=await run(p,{db,localUrl:url});assert.equal(s.state,'partial');assert.equal(s.reason,'REQUEST_BUDGET');assert.equal(s.requests,2);assert.equal(requests.length,2);assert.equal(s.matches,2);
  });
});
test('truncated metadata collects remaining disclosed pages, never declares complete',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'api-csv-http-')),db=join(dir,'run.sqlite'),p=makePlan({...input(dir),provider:'local-http'});
  await server((req,res,u)=>json(res,200,u.pathname==='/v1/account'?{limits:{max_per_page:100}}:{...page(u),truncated:true}),async(url,requests)=>{
    const s=await run(p,{db,localUrl:url});assert.equal(s.state,'partial');assert.equal(s.domains,3);assert.equal(requests.length,3);assert.equal(s.queryOutcomes[0].reason,'PROVIDER_TRUNCATED');
  });
});
test('X-Truncated header wins over a false body field',async()=>{
  await server((req,res,u)=>json(res,200,page(u),{'X-Truncated':'true'}),async url=>assert.equal((await createProvider(opts(url)).search('x',1,2)).truncated,true));
});
test('account size/depth6 permits three pages of size2; max_per_page2 stops after one',async()=>{
  for(const maximum of [6,2]){
    const dir=mkdtempSync(join(tmpdir(),'api-csv-http-')),db=join(dir,'run.sqlite'),p=makePlan({...input(dir),provider:'local-http'});
    await server((req,res,u)=>{
      if(u.pathname==='/v1/account')return json(res,200,{limits:{max_per_page:maximum,disclosed_positions:6}});
      const n=Number(u.searchParams.get('page')),size=2;
      const results=[0,1].map(i=>({domain:`host${(n-1)*2+i}.test`,url:`https://host${(n-1)*2+i}.test/`,rank:i,ranked:true}));
      json(res,200,{query:u.searchParams.get('query'),page:n,per_page:size,total:6,total_pages:3,returned:2,truncated:false,results});
    },async(url,requests)=>{
      const s=await run(p,{db,localUrl:url});assert.equal(requests.length,maximum===6?4:2);assert.equal(s.domains,maximum);assert.equal(s.state,maximum===6?'complete':'partial');
      assert.equal(s.accountLimits.disclosedPositions,6);
    });
  }
});
test('server page_too_deep marks one query partial and continues independent queries',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'api-csv-http-')),db=join(dir,'run.sqlite'),files=input(dir);
  writeFileSync(files.footprints,'footprint_id,template\nwidget,{location} demo\nother,{location} other\n');const p=makePlan({...files,provider:'local-http'});
  await server((req,res,u)=>{
    if(u.pathname==='/v1/account')return json(res,200,{limits:{max_per_page:100,disclosed_positions:100}});
    if(u.searchParams.get('query').includes('demo')&&u.searchParams.get('page')==='2')return json(res,400,{error:{code:'page_too_deep'}});
    json(res,200,page(u));
  },async url=>{
    const s=await run(p,{db,localUrl:url});assert.equal(s.state,'partial');assert.equal(s.queryStates.complete,1);assert.equal(s.queryStates.partial,1);assert.equal(s.matches,5);
  });
});
test('zero-result search completes with an empty successful page',async()=>{
  await server((req,res,u)=>json(res,200,{query:u.searchParams.get('query'),page:1,per_page:2,total:0,total_pages:0,returned:0,truncated:false,results:[]}),async url=>{
    assert.equal((await createProvider(opts(url)).search('empty',1,2)).returned,0);
  });
});
