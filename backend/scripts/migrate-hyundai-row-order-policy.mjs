import {spawnSync} from 'node:child_process';
const script=String.raw`
const d=db.getSiblingDB('career-form'),c=d.form_analysis_companies.findOne({companyKey:'hyundai'});
if(!c||![15,16].includes(Number(c.activePolicyVersion)))throw Error('Unexpected active version');
const old=d.form_analysis_policies.findOne({companyKey:'hyundai',version:15});if(!old)throw Error('Missing v15');
const before=EJSON.stringify(old),next=EJSON.parse(before);
next._id='hyundai-policy-v16';next.version=NumberLong('16');
next.executionPolicy.browserPolicy.hiddenCodeContract.behavior.rowPreparation.selectionOrder='BEFORE_NEXT_ROW';
const existing=d.form_analysis_policies.findOne({_id:next._id});
if(!existing)d.form_analysis_policies.insertOne(next);else if(EJSON.stringify(existing)!==EJSON.stringify(next))throw Error('Existing v16 differs');
if(Number(c.activePolicyVersion)===15){const r=d.form_analysis_companies.updateOne({_id:c._id,activePolicyVersion:c.activePolicyVersion},{$set:{activePolicyVersion:NumberLong('16')}});if(r.modifiedCount!==1)throw Error('Concurrent activation');}
if(EJSON.stringify(d.form_analysis_policies.findOne({_id:old._id}))!==before)throw Error('Previous changed');
print('Hyundai v16 active: BEFORE_NEXT_ROW; previous version preserved');
`;
const r=spawnSync('docker',['exec','2026-career-form-mongodb-1','mongosh','--quiet','--eval',script],{stdio:'inherit'});process.exitCode=r.status??1;
