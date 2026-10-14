import { spawnSync } from "node:child_process";
const script = `
const d=db.getSiblingDB('career-form');
const company=d.form_analysis_companies.findOne({companyKey:'greeting'});
if(!company||![3,4].includes(Number(company.activePolicyVersion)))throw Error('Unexpected active version');
const previous=d.form_analysis_policies.findOne({companyKey:'greeting',version:3});
if(!previous)throw Error('Missing v3');
const preserved=EJSON.stringify(previous);
const keys=['education.university.attendanceType','education.graduateSchool.attendanceType'];
let changed=0;
const fieldRules=previous.fieldRules.map(rule=>{
 if(!keys.includes(rule.valueBinding?.profileFieldKey))return rule;
 if(rule.control!=='RADIO')throw Error('Unexpected control');
 changed++;
 return {...rule,valueBinding:{profileFieldKey:rule.valueBinding.profileFieldKey,optionMap:{'attendance:day':'주간','attendance:night':'야간','주간':'주간','야간':'야간'},_class:'com.careerform.formanalysis.application.port.FieldMappingResolver$LookupBinding'}};
});
if(changed!==2)throw Error('Expected two attendance rules');
const next={...previous,_id:'greeting-policy-v4',version:NumberLong('4'),fieldRules};
const existing=d.form_analysis_policies.findOne({companyKey:'greeting',version:4});
if(!existing)d.form_analysis_policies.insertOne(next);
else if(JSON.stringify(existing.fieldRules)!==JSON.stringify(fieldRules)||JSON.stringify(existing.executionPolicy)!==JSON.stringify(previous.executionPolicy)||JSON.stringify(existing.actionRules)!==JSON.stringify(previous.actionRules))throw Error('Existing v4 differs');
if(Number(company.activePolicyVersion)!==4){const result=d.form_analysis_companies.updateOne({_id:company._id,activePolicyVersion:company.activePolicyVersion},{$set:{activePolicyVersion:NumberLong('4')}});if(result.modifiedCount!==1)throw Error('Concurrent activation');}
if(EJSON.stringify(d.form_analysis_policies.findOne({_id:previous._id}))!==preserved)throw Error('Previous version changed');
print(JSON.stringify({activeVersion:4,changedRules:changed,preservedVersion:3,fieldRules:fieldRules.length}));
`;
const result=spawnSync('docker',['exec','2026-career-form-mongodb-1','mongosh','--quiet','--eval',script],{stdio:'inherit'});
process.exitCode=result.status??1;
