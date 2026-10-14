import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const read = name => JSON.parse(readFileSync(new URL(`../src/main/resources/policies/${name}-browser-v1.json`, import.meta.url),'utf8'));
const policies = {sk:read('sk'),greeting:read('greeting')};
const script='const policies='+JSON.stringify(policies)+';'+`
const d=db.getSiblingDB('career-form');
for(const [key,oldVersion,version] of [['sk',29,30],['hyundai',13,14],['greeting',4,5]]) {
 const c=d.form_analysis_companies.findOne({companyKey:key});
 if(!c||![oldVersion,version].includes(Number(c.activePolicyVersion)))throw Error('Unexpected '+key+' version');
 const old=d.form_analysis_policies.findOne({companyKey:key,version:oldVersion});
 if(!old)throw Error('Missing previous '+key);
 const before=EJSON.stringify(old);
 const next={...old,_id:key+'-policy-v'+version,version:NumberLong(String(version))};
 if(key==='sk') {
  next.executionPolicy={...old.executionPolicy,browserPolicy:policies.sk};
  next.fieldRules=old.fieldRules.map(r=>r.structuralName==='eduhgToDate'?{...r,valueBinding:{profileFieldKey:r.valueBinding.profileFieldKey,recipe:'YEAR_MONTH',_class:'com.careerform.formanalysis.application.port.FieldMappingResolver$DerivedBinding'}}:r);
 }
 if(key==='hyundai') next.fieldRules=old.fieldRules.map(r=>r.structuralName==='point'?{...r,enabledOnly:true}:r);
 if(key==='greeting') next.executionPolicy={...old.executionPolicy,componentPolicy:policies.greeting};
 const existing=d.form_analysis_policies.findOne({_id:next._id});
 if(!existing)d.form_analysis_policies.insertOne(next);
 else if(EJSON.stringify(existing)!==EJSON.stringify(next))throw Error('Existing new policy differs: '+key);
 if(Number(c.activePolicyVersion)===oldVersion){const r=d.form_analysis_companies.updateOne({_id:c._id,activePolicyVersion:c.activePolicyVersion},{$set:{activePolicyVersion:NumberLong(String(version))}});if(r.modifiedCount!==1)throw Error('Concurrent activation');}
 if(EJSON.stringify(d.form_analysis_policies.findOne({_id:old._id}))!==before)throw Error('Previous changed');
 print(JSON.stringify({company:key,activeVersion:version,previousPreserved:true}));
}
`;
const r=spawnSync('docker',['exec','2026-career-form-mongodb-1','mongosh','--quiet','--eval',script],{stdio:'inherit'});
process.exitCode=r.status??1;
