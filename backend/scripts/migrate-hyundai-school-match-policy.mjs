// Explicit local migration; preserve v12 and activate v13 with compare-and-set.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const browserPolicy = JSON.parse(readFileSync(new URL("../src/main/resources/policies/hyundai-browser-v1.json", import.meta.url), "utf8"));
const script = "const browserPolicy=" + JSON.stringify(browserPolicy) + ";" + `
const d=db.getSiblingDB('career-form');
const c=d.form_analysis_companies.findOne({companyKey:'hyundai'});
if(!c||![12,13].includes(Number(c.activePolicyVersion)))throw Error('Unexpected active version');
const old=d.form_analysis_policies.findOne({companyKey:'hyundai',version:12});
if(!old)throw Error('Missing v12');
const before=EJSON.stringify(old);
const next={...old,_id:'hyundai-policy-v13',version:NumberLong('13'),executionPolicy:{...old.executionPolicy,browserPolicy}};
const existing=d.form_analysis_policies.findOne({_id:next._id});
if(!existing)d.form_analysis_policies.insertOne(next);
else if(EJSON.stringify(existing)!==EJSON.stringify(next))throw Error('Existing v13 differs');
if(Number(c.activePolicyVersion)===12){const r=d.form_analysis_companies.updateOne({_id:c._id,activePolicyVersion:c.activePolicyVersion},{$set:{activePolicyVersion:NumberLong('13')}});if(r.modifiedCount!==1)throw Error('Concurrent activation');}
if(EJSON.stringify(d.form_analysis_policies.findOne({_id:old._id}))!==before)throw Error('Previous policy changed');
print(JSON.stringify({activeVersion:Number(d.form_analysis_companies.findOne({_id:c._id}).activePolicyVersion),previousPreserved:true,schoolRules:browserPolicy.hiddenCodeContract.behavior.searches.filter(x=>x.resultMatch).length}));
`;
const r=spawnSync('docker',['exec','2026-career-form-mongodb-1','mongosh','--quiet','--eval',script],{stdio:'inherit'});
process.exitCode=r.status??1;
