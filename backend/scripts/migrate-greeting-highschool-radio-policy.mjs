import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const policy=JSON.parse(readFileSync(new URL('../src/main/resources/policies/greeting-browser-v1.json',import.meta.url),'utf8'));
const script='const educationGroups='+JSON.stringify(policy.groups.education)+';'+`
const d=db.getSiblingDB('career-form');
const c=d.form_analysis_companies.findOne({companyKey:'greeting'});
if(!c||![7,8].includes(Number(c.activePolicyVersion)))throw Error('Unexpected active version');
const old=d.form_analysis_policies.findOne({companyKey:'greeting',version:7});
if(!old)throw Error('Missing v7');
const before=EJSON.stringify(old),next=EJSON.parse(before);
next._id='greeting-policy-v8';next.version=NumberLong('8');
next.executionPolicy.componentPolicy.groups.education=educationGroups;
const existing=d.form_analysis_policies.findOne({_id:next._id});
if(!existing)d.form_analysis_policies.insertOne(next);
else if(EJSON.stringify(existing)!==EJSON.stringify(next))throw Error('Existing v8 differs');
if(Number(c.activePolicyVersion)===7){const r=d.form_analysis_companies.updateOne({_id:c._id,activePolicyVersion:c.activePolicyVersion},{$set:{activePolicyVersion:NumberLong('8')}});if(r.modifiedCount!==1)throw Error('Concurrent activation');}
if(EJSON.stringify(d.form_analysis_policies.findOne({_id:old._id}))!==before)throw Error('Previous changed');
print(JSON.stringify({activeVersion:8,previousPreserved:true,educationGroups}));
`;
const r=spawnSync('docker',['exec','2026-career-form-mongodb-1','mongosh','--quiet','--eval',script],{stdio:'inherit'});
process.exitCode=r.status??1;
