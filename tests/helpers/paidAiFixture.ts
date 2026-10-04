/** Offline canonical-auth and central-ledger fixture. Never forwards Supabase traffic. */
import assert from "node:assert/strict";
import { before, beforeEach, after, test as nodeTest, type TestContext, type TestOptions } from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import dns from "node:dns";
import { runPaidContext } from "@/lib/billing/paidContext";
import { invalidateQuotaCache } from "@/lib/billing/quotaGate";
export const fixtureUser = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const origin = "https://paid-fixture.supabase.co";
let token = "", jwk: unknown;
const env = { SUPABASE_URL: origin, NEXT_PUBLIC_SUPABASE_URL: origin, SUPABASE_SERVICE_ROLE_KEY: "dummy", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-public-only",
  ECOSYSTEM_MODEL_PRICES_JSON: JSON.stringify(Object.fromEntries(["doubao-seed-2.0-mini","mini","mini-router","title-unknown-model","title-model","title-bill-model","embedding-3","BAAI/bge-m3"].map(id=>[id,{input:0.5,cachedInput:0.5,output:0.5}]))),
  ECOSYSTEM_SERVICE_PRICES_JSON: JSON.stringify({"search:search_pro":0.001,"byok:search:*":0.001,"search:api.perplexity.ai":0.001,"search:sonar":0.001,"search:kimi-k2.6":0.001,"image-search:unsplash":0,"rerank:BAAI/bge-reranker-v2-m3":0.001}) };
const saved = Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
export const fixtureLedger = { available: 100000000, events: [] as string[], seen: new Set<string>(), active: true, factors: [] as object[] };
before(async()=>{
  Object.assign(process.env,env);
  const pair = generateKeyPairSync("rsa",{modulusLength:2048});
  jwk = {...pair.publicKey.export({format:"jwk"}),kid:"fixture",alg:"RS256",use:"sig"};
  const b64=(v:object)=>Buffer.from(JSON.stringify(v)).toString("base64url");
  const payload=b64({alg:"RS256",kid:"fixture"})+"."+b64({sub:fixtureUser,iss:`${origin}/auth/v1`,aud:"authenticated",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,aal:"aal2",session_id:crypto.randomUUID(),role:"authenticated"});
  token=payload+"."+sign("RSA-SHA256",Buffer.from(payload),pair.privateKey).toString("base64url");
});
after(()=>{for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
beforeEach(t=>{
  // Provider HTTP is intercepted below. Resolve synthetic public names without
  // touching the machine's DNS; literal/private addresses still fail preflight.
  (t as TestContext).mock.method(dns.promises, "lookup", async () => [{ address: "8.8.8.8", family: 4 }]);
  fixtureLedger.available=100000000;fixtureLedger.events.length=0;fixtureLedger.seen.clear();fixtureLedger.active=true;fixtureLedger.factors=[];
  invalidateQuotaCache(fixtureUser);
  mockPaidFetch(t as TestContext,async()=>{throw new Error("Provider fetch must be explicitly mocked");});
});
export class PaidRequest extends Request {
  constructor(input: RequestInfo | URL,init:RequestInit={}){
    const headers=new Headers(init.headers);headers.set("authorization",`Bearer ${token}`);
    super(input,{...init,headers});
  }
}
export function test(name:string,optionsOrFn:TestOptions|((t:TestContext)=>unknown|Promise<unknown>),handler?:(t:TestContext)=>unknown|Promise<unknown>){
  const options=typeof optionsOrFn==="function"?{}:optionsOrFn;
  const fn=typeof optionsOrFn==="function"?optionsOrFn:handler!;
  return nodeTest(name,options,t=>runPaidContext({userId:fixtureUser,requestId:crypto.randomUUID(),route:"fixture",sequence:0,reservedCny:0},async()=>{await fn(t);} ));
}
export function mockPaidFetch<A extends unknown[]>(t: Pick<TestContext,"mock">,provider: (...args: A)=>Response|Promise<Response>){
  const providerMock=t.mock.fn(provider);
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(typeof input==="string"?input:input instanceof URL?input.toString():input.url);
    if(url.origin!==origin){fixtureLedger.events.push("provider");return providerMock(...([input,init] as unknown as A));}
    const body=typeof init?.body==="string"?JSON.parse(init.body):{};
    if(url.pathname.endsWith("/.well-known/jwks.json"))return Response.json({keys:[jwk]});
    if(url.pathname==="/auth/v1/user"){
      const auth=new Headers(init?.headers).get("authorization");
      if(auth!==`Bearer ${token}`)return Response.json({message:"Invalid token"},{status:401});
      return Response.json({id:fixtureUser,email:"fixture@example.invalid",email_confirmed_at:"2026-01-01T00:00:00Z",factors:fixtureLedger.factors});
    }
    if(url.pathname.endsWith("/user_profiles"))return Response.json({account_role:"user",is_active:fixtureLedger.active});
    if(url.pathname.endsWith("/ensure_period_credits"))return Response.json({period_start:"2026-09-01T00:00:00Z",period_end:"2026-10-01T00:00:00Z"});
    if(url.pathname.endsWith("/credit_account_summary"))return Response.json({available_microcredits:String(fixtureLedger.available),held_microcredits:"0",charged_microcredits:"0"});
    if(url.pathname.endsWith("/ecosystem_entitlements"))return Response.json({plan_id:"free"});
    if(url.pathname.endsWith("/ss_ai_admissions")){
      if(init?.method==="POST"){
        assert.equal(body.user_id,fixtureUser);
        if(fixtureLedger.seen.has(body.request_key))return Response.json({code:"23505",message:"duplicate"},{status:409});
        fixtureLedger.seen.add(body.request_key);
      }
      return new Response(null,{status:201});
    }
    if(url.pathname.endsWith("/credit_apply")){
      assert.equal(body.p_user_id,fixtureUser);fixtureLedger.events.push(body.p_action);
      if(body.p_action==="reserve"&&body.p_amount>fixtureLedger.available)return Response.json({code:"P0001",message:"insufficient_credits"},{status:400});
      return Response.json({state:body.p_action==="reserve"?"reserved":body.p_action});
    }
    if(url.pathname.endsWith("/ss_usage_ledger"))return new Response(null,{status:201});
    throw new Error(`Unexpected fixture API: ${url.pathname}`);
  });
  return providerMock;
}
