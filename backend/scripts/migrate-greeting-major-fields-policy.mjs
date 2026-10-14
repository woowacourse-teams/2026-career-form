import { spawnSync } from 'node:child_process';
const script = String.raw`
const d = db.getSiblingDB('career-form');
const c = d.form_analysis_companies.findOne({companyKey:'greeting'});
if (!c || ![9,10].includes(Number(c.activePolicyVersion))) throw Error('Unexpected active version');
const old = d.form_analysis_policies.findOne({companyKey:'greeting',version:9});
if (!old) throw Error('Missing v9');
const before = EJSON.stringify(old), next = EJSON.parse(before);
next._id = 'greeting-policy-v10'; next.version = NumberLong('10');
for (const [site,section,group] of [['universities','university','educationuniversity'],['graduateSchools','graduateSchool','educationgraduateschool']]) {
  for (const slot of [0,1,2]) {
    const name = 'educationalBackground.'+site+'.*.majors.'+slot+'.majorField';
    next.fieldRules = next.fieldRules.filter(r => r.structuralName !== name);
    const valueBinding = slot === 0
      ? {profileFieldKey:'education.'+section+'.majorField',_class:'com.careerform.formanalysis.application.port.FieldMappingResolver$DirectBinding'}
      : {recipe:'UNIVERSITY_ADDITIONAL_MAJOR_'+slot+'_FIELD',profileFieldKey:'education.'+section+'.additionalMajorField',_class:'com.careerform.formanalysis.application.port.FieldMappingResolver$DerivedBinding'};
    next.fieldRules.push({structuralName:name,element:'INPUT',control:'BUTTON',valueBinding,allowReadonlyWrite:false,requiredDomName:name,requiredItemGroupId:group});
  }
}
const existing = d.form_analysis_policies.findOne({_id:next._id});
if (!existing) d.form_analysis_policies.insertOne(next);
else if (EJSON.stringify(existing)!==EJSON.stringify(next)) throw Error('Existing v10 differs');
if (Number(c.activePolicyVersion)===9) {
  const r=d.form_analysis_companies.updateOne({_id:c._id,activePolicyVersion:c.activePolicyVersion},{$set:{activePolicyVersion:NumberLong('10')}});
  if(r.modifiedCount!==1) throw Error('Concurrent activation');
}
if(EJSON.stringify(d.form_analysis_policies.findOne({_id:old._id}))!==before) throw Error('Previous policy changed');
print('Greeting v10 active: six major category mappings; v9 preserved');
`;
const result=spawnSync('docker',['exec','2026-career-form-mongodb-1','mongosh','--quiet','--eval',script],{stdio:'inherit'});
process.exitCode=result.status??1;
