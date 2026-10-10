import assert from "node:assert/strict";
import { test } from "node:test";
import { billableJsonFetch } from "./billableFetch";
import { runPaidContext } from "./paidContext";

test("raw provider transport performs shared admission before cost, dedupes and holds unknown outcomes", async () => {
  const savedFetch=globalThis.fetch;
  const keys=["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_ANON_KEY","ECOSYSTEM_MODEL_PRICES_JSON"];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  process.env.SUPABASE_URL="https://billing-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY="dummy";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="test-only-public-key";
  process.env.ECOSYSTEM_MODEL_PRICES_JSON=JSON.stringify({"test-embed":{input:2,cachedInput:2,output:0}});
  const events:string[]=[],seen=new Set<string>();
  let providerStatus=200,networkFailure=false;
  globalThis.fetch=async(input,init)=>{
    const url=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
    const body=typeof init?.body==="string"?JSON.parse(init.body):{};
    if(url.startsWith("https://billing-test.supabase.co/")){
      if(url.includes("ensure_period_credits")){events.push("allowance");return Response.json({});}
      if(url.includes("ss_ai_admissions")){
        if(init?.method==="POST"){
          if(seen.has(body.request_key))return Response.json({code:"23505",message:"duplicate"},{status:409});
          seen.add(body.request_key);events.push("guard");
        }
        return new Response(null,{status:201});
      }
      if(url.includes("credit_apply")){events.push(body.p_action);return Response.json({state:body.p_action==="reserve"?"reserved":body.p_action});}
      throw new Error("Unexpected DB operation");
    }
    assert.equal(url,"https://provider.test/embeddings");events.push("provider");
    if(networkFailure)throw new Error("network outcome unknown");
    return Response.json({data:[],usage:{prompt_tokens:10}},{status:providerStatus});
  };
  const run=(key:string,model="test-embed")=>runPaidContext({userId:"00000000-0000-4000-8000-000000000001",requestId:key,route:"/api/chat",sequence:0,reservedCny:0},
    ()=>billableJsonFetch("https://provider.test/embeddings",{method:"POST",body:JSON.stringify({model,input:["hello"]})},{model,kind:"embedding"}));
  try{
    await run("successful");assert.deepEqual(events,["allowance","guard","reserve","provider","settle"]);
    events.length=0;await assert.rejects(run("successful"));assert.deepEqual(events,["allowance"]);
    events.length=0;await assert.rejects(run("unknown-price","not-priced"));assert.deepEqual(events,[]);
    providerStatus=400;events.length=0;assert.equal((await run("rejected")).status,400);assert.deepEqual(events,["allowance","guard","reserve","provider","cancel"]);
    providerStatus=200;networkFailure=true;events.length=0;await assert.rejects(run("unknown-outcome"));assert.deepEqual(events,["allowance","guard","reserve","provider"]);
  }finally{
    globalThis.fetch=savedFetch;
    for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
  }
});
