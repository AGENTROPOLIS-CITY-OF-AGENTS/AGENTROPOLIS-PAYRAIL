import test from "node:test";
import assert from "node:assert/strict";
import { NanoGuard } from "./index.mjs";
function setup(budget=100n) {
  let now=100000; const gate=new NanoGuard({now:()=>now});
  gate.configure("global",{budget:Number(budget),windowMs:60000,maxCount:100,maxRecipients:2,dormantMs:30000,allowlist:["trusted"]});
  for(const w of ["w1","w2","w3"])gate.userActivity("global",w);
  const req=(id,wallet="w1",chain="solana",value=1n,maxFee=1n)=>({group:"global",id,wallet,chain,asset:"TEST",recipient:"trusted",value,maxFee,mandateValid:true,payloadMatches:true});
  return {gate,req,advance:(ms)=>{now+=ms}};
}
test("shared budget across chains and wallets prevents overspend",()=>{
  const {gate,req}=setup(10n);
  assert.equal(gate.reserve(req("a","w1","solana",4n,1n)).status,"RESERVED");
  assert.equal(gate.reserve(req("b","w2","evm",4n,1n)).status,"RESERVED");
  assert.equal(gate.reserve(req("c","w3","xrpl",1n,0n)).reason,"AGGREGATE_BUDGET");
  assert.equal(gate.snapshot("global").reserved,"10");
});
test("parallel microtransactions cannot race in single-process kernel",async()=>{
  const {gate,req}=setup(20n);
  const results=await Promise.all(Array.from({length:100},(_,i)=>Promise.resolve().then(()=>gate.reserve(req(String(i),"w1",i%2?"evm":"xrpl",1n,0n)))));
  assert.equal(results.filter(x=>x.status==="RESERVED").length,20);
  assert.equal(gate.snapshot("global").reserved,"20");
});
test("failed fee is charged; unproven expiry remains reserved",()=>{
  const {gate,req}=setup();
  assert.equal(gate.reserve(req("a")).status,"RESERVED");
  assert.equal(gate.settle("global","a",{status:"EXPIRED"}).status,"PENDING_FINALITY");
  assert.equal(gate.snapshot("global").reserved,"2");
  assert.equal(gate.settle("global","a",{status:"FAILED",actualFee:1n}).status,"ACCOUNTED");
  assert.equal(gate.snapshot("global").spent,"1");
});
test("dormancy, unverified recipients and mandate mismatch fail closed",()=>{
  const {gate,req,advance}=setup();
  assert.equal(gate.reserve({...req("a"),recipient:"unknown"}).status,"HOLD");
  assert.equal(gate.reserve({...req("b"),payloadMatches:false}).reason,"MANDATE");
  advance(30000);
  assert.equal(gate.reserve(req("c")).reason,"DORMANT");
});
test("sliding window includes spending just before boundary",()=>{
  const {gate,req,advance}=setup(10n);
  assert.equal(gate.reserve(req("a","w1","evm",8n,1n)).status,"RESERVED");
  gate.settle("global","a",{status:"FINALIZED",actualValue:8n,actualFee:1n});
  advance(29999);
  assert.equal(gate.reserve(req("b","w2","xrpl",2n,0n)).reason,"AGGREGATE_BUDGET");
});
