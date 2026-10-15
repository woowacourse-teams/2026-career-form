import {spawnSync} from 'node:child_process';
const script=String.raw`
const d=db.getSiblingDB('career-form'),c=d.form_analysis_companies.findOne({companyKey:'greeting'});
if(!c||![8,9].includes(Number(c.activePolicyVersion)))throw Error('Unexpected version');
const old=d.form_analysis_policies.findOne({companyKey:'greeting',version:8});if(!old)throw Error('Missing v8');
const before=EJSON.stringify(old),next=EJSON.parse(before);next._id='greeting-policy-v9';next.version=NumberLong('9');
const prefix='educationalBackground.graduateSchools.*.majors.';
next.fieldRules=next.fieldRules.filter(r=>![prefix+'0.majorClassification',prefix+'1',prefix+'1.majorClassification',prefix+'1.majorField'].includes(r.structuralName));
for(const slot of [1,2])for(const kind of ['NAME','CLASSIFICATION']){
 const name=prefix+slot+(kind==='CLASSIFICATION'?'.majorClassification':'');
 next.fieldRules.push({structuralName:name,element:'INPUT',control:kind==='NAME'?'TEXT':'BUTTON',valueBinding:{recipe:'UNIVERSITY_ADDITIONAL_MAJOR_'+slot+'_'+kind,profileFieldKey:'education.graduateSchool.additionalMajorName',_class:'com.careerform.formanalysis.application.port.FieldMappingResolver$DerivedBinding'},allowReadonlyWrite:false,requiredDomName:name,requiredItemGroupId:'educationgraduateschool'});
}
const p=next.executionPolicy.componentPolicy;
p.freshDefaults=p.freshDefaults.filter(r=>!r.pattern.includes('graduateSchools'));
for(const slot of [1,2])p.freshDefaults.push({pattern:'^educationalBackground\\.graduateSchools\\.(0|[1-9]\\d*)\\.majors\\.'+slot+'\\.majorClassification$',binding:'DERIVED',key:'UNIVERSITY_ADDITIONAL_MAJOR_'+slot+'_CLASSIFICATION'});
const existing=d.form_analysis_policies.findOne({_id:next._id});if(!existing)d.form_analysis_policies.insertOne(next);else if(EJSON.stringify(existing)!==EJSON.stringify(next))throw Error('Existing differs');
if(Number(c.activePolicyVersion)===8){const r=d.form_analysis_companies.updateOne({_id:c._id,activePolicyVersion:c.activePolicyVersion},{$set:{activePolicyVersion:NumberLong('9')}});if(r.modifiedCount!==1)throw Error('Concurrent activation');}
if(EJSON.stringify(d.form_analysis_policies.findOne({_id:old._id}))!==before)throw Error('Previous changed');
print('Greeting v9 active; separate named majors mapped to derived compact slots');
`;
const r=spawnSync('docker',['exec','2026-career-form-mongodb-1','mongosh','--quiet','--eval',script],{stdio:'inherit'});process.exitCode=r.status??1;
