import {spawnSync} from 'node:child_process';
const script=String.raw`
const d=db.getSiblingDB('career-form'),c=d.form_analysis_companies.findOne({companyKey:'sk'});
if(!c||![32,33].includes(Number(c.activePolicyVersion)))throw Error('Unexpected active version');
const old=d.form_analysis_policies.findOne({companyKey:'sk',version:32}),before=EJSON.stringify(old),next=EJSON.parse(before);
next._id='sk-policy-v33';next.version=NumberLong('33');
const bp=next.executionPolicy.browserPolicy,template=bp.collection.actions.find(r=>r.id==='btnAddEducationUniv');
if(!template)throw Error('Missing university template');
bp.collection.actions.push({...template,id:'btnAddEducationGrad',label:'대학원 학력 정보 추가',selector:'button.btn.medium.btn-dashed.btnAddEducationGrad',rowSelector:'div.form-item-group.educationGrad-item',requiredSelector:"input[name='edugdEducationName']"});
bp.repeatHints.btnAddEducationGrad={categoryId:'education',sectionId:'graduateSchool'};
const existing=d.form_analysis_policies.findOne({_id:next._id});
if(!existing)d.form_analysis_policies.insertOne(next);else if(EJSON.stringify(existing)!==EJSON.stringify(next))throw Error('Existing differs');
if(Number(c.activePolicyVersion)===32){const r=d.form_analysis_companies.updateOne({_id:c._id,activePolicyVersion:c.activePolicyVersion},{$set:{activePolicyVersion:NumberLong('33')}});if(r.modifiedCount!==1)throw Error('Concurrent change');}
if(EJSON.stringify(d.form_analysis_policies.findOne({_id:old._id}))!==before)throw Error('Old changed');
print('SK v33 active; cloned graduate button identification added; v32 preserved');
`;
const r=spawnSync('docker',['exec','2026-career-form-mongodb-1','mongosh','--quiet','--eval',script],{stdio:'inherit'});process.exitCode=r.status??1;
