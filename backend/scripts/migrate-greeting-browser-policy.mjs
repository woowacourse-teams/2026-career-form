// Explicit local migration: preserve previous versions and never overwrite an existing version.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const componentPolicy = JSON.parse(readFileSync(new URL("../src/main/resources/policies/greeting-browser-v1.json", import.meta.url), "utf8"));
const script = "const componentPolicy=" + JSON.stringify(componentPolicy) + ";\n" + `
const d=db.getSiblingDB('career-form');
const original=d.form_analysis_policies.findOne({companyKey:'greeting',version:2}) ?? d.form_analysis_policies.findOne({companyKey:'greeting',version:1});
if(!original)throw Error('Missing previous policy');
const preserved=EJSON.stringify(original);
const company=d.form_analysis_companies.findOne({companyKey:'greeting'});
if(company&&![1,2,3].includes(Number(company.activePolicyVersion)))throw Error('Unexpected active policy');
const executionPolicy={version:1,searches:[],failureScopes:[],address:null,componentPolicy};
const existing=d.form_analysis_policies.findOne({companyKey:'greeting',version:3});
if(!existing)d.form_analysis_policies.insertOne({...original,_id:'greeting-policy-v3',version:NumberLong('3'),executionPolicy});
else if(JSON.stringify(existing.executionPolicy)!==JSON.stringify(executionPolicy)||JSON.stringify(existing.fieldRules)!==JSON.stringify(original.fieldRules)||JSON.stringify(existing.actionRules)!==JSON.stringify(original.actionRules))throw Error('Existing v3 differs; refusing overwrite');
if(!company)d.form_analysis_companies.insertOne({_id:'greeting-platform',companyKey:'greeting',host:'greetinghr.com',pathPrefixes:[],activePolicyVersion:NumberLong('3')});
else if(Number(company.activePolicyVersion)!==3){const result=d.form_analysis_companies.updateOne({_id:company._id,activePolicyVersion:company.activePolicyVersion},{$set:{activePolicyVersion:NumberLong('3')}});if(result.modifiedCount!==1)throw Error('Concurrent activation');}
if(EJSON.stringify(d.form_analysis_policies.findOne({_id:original._id}))!==preserved)throw Error('Previous policy changed');
print(JSON.stringify({version:3,preservedVersion:Number(original.version),fields:original.fieldRules.length,sections:Object.keys(componentPolicy.sections).length,dateRules:componentPolicy.dateRules.length}));
`;
const result=spawnSync("docker",["exec","2026-career-form-mongodb-1","mongosh","--quiet","--eval",script],{stdio:"inherit"});
process.exitCode=result.status??1;
