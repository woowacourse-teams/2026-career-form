import { spawnSync } from 'node:child_process';
const script = String.raw`
const d = db.getSiblingDB('career-form');
const c = d.form_analysis_companies.findOne({companyKey:'greeting'});
if (!c || ![10,11].includes(Number(c.activePolicyVersion))) throw Error('Unexpected active version');
const old = d.form_analysis_policies.findOne({companyKey:'greeting',version:10});
if (!old) throw Error('Missing v10');
const before = EJSON.stringify(old), next = EJSON.parse(before);
next._id = 'greeting-policy-v11'; next.version = NumberLong('11');
for (const rule of next.executionPolicy.componentPolicy.searchKinds) {
  rule.matchMode = 'NAME_ONLY';
}
const existing = d.form_analysis_policies.findOne({_id:next._id});
if (!existing) d.form_analysis_policies.insertOne(next);
else if (EJSON.stringify(existing)!==EJSON.stringify(next)) throw Error('Existing v11 differs');
if (Number(c.activePolicyVersion)===10) {
  const r=d.form_analysis_companies.updateOne({_id:c._id,activePolicyVersion:c.activePolicyVersion},{$set:{activePolicyVersion:NumberLong('11')}});
  if(r.modifiedCount!==1) throw Error('Concurrent activation');
}
if(EJSON.stringify(d.form_analysis_policies.findOne({_id:old._id}))!==before) throw Error('Previous policy changed');
print('Greeting v11 active: catalog search matches names only; v10 preserved');
`;
const result=spawnSync('docker',['exec','2026-career-form-mongodb-1','mongosh','--quiet','--eval',script],{stdio:'inherit'});
process.exitCode=result.status??1;
