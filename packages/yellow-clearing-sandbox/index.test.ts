import { strict as assert } from "node:assert";
import { test } from "node:test";
import { simulateNetting, executeSettlement } from "./index.ts";
test("netting is conserved and deterministic",()=>{
 const x=simulateNetting([{id:"a",from:"A",to:"B",cents:100n},{id:"b",from:"B",to:"A",cents:40n}]);
 assert.deepEqual(x.netByAccount,{A:"-60",B:"60"});
 assert.equal(x.mode,"SIMULATION_ONLY");
});
test("replay rejected",()=>assert.throws(()=>simulateNetting([{id:"x",from:"A",to:"B",cents:1n},{id:"x",from:"A",to:"B",cents:1n}]),/REPLAYED/));
test("invalid amounts rejected",()=>assert.throws(()=>simulateNetting([{id:"x",from:"A",to:"B",cents:0n}]),/INVALID/));
test("live settlement impossible",()=>assert.throws(()=>executeSettlement(),/DISABLED/));
