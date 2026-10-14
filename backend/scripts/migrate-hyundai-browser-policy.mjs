// Explicit local migration. Keep previous versions unchanged; startup never overwrites.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const browserPolicy = JSON.parse(
  readFileSync(
    new URL(
      "../src/main/resources/policies/hyundai-browser-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const script =
  "const browserPolicy=" +
  JSON.stringify(browserPolicy) +
  ";\n" +
  `
const d=db.getSiblingDB('career-form');
const company=d.form_analysis_companies.findOne({companyKey:'hyundai'});
if(!company||![11,12].includes(Number(company.activePolicyVersion)))throw Error('Unexpected active policy');
const original=d.form_analysis_policies.findOne({companyKey:'hyundai',version:11});
if(!original)throw Error('Missing previous policy');
const originals=d.form_analysis_policies.find({companyKey:'hyundai',version:{$in:[8,9,10,11]}}).toArray();
const preserved=originals.map(p=>EJSON.stringify(p));
const executionPolicy={version:1,searches:[],failureScopes:[],address:null,browserPolicy};
const fieldRules=[...original.fieldRules, {
 structuralName:'typeGb',element:'INPUT',control:'BUTTON',allowReadonlyWrite:false,
 valueBinding:{profileFieldKey:'publications.publicationPatent.type',optionMap:{'논문':'논문','특허':'특허'},optionCodeMap:{'논문':'T','특허':'P'},_class:'com.careerform.formanalysis.application.port.FieldMappingResolver$ButtonOptionBinding'}
}];
const existing=d.form_analysis_policies.findOne({companyKey:'hyundai',version:12});
if(!existing)d.form_analysis_policies.insertOne({...original,_id:'hyundai-policy-v12',version:NumberLong('12'),executionPolicy,fieldRules});
else if(JSON.stringify(existing.executionPolicy)!==JSON.stringify(executionPolicy)||JSON.stringify(existing.fieldRules)!==JSON.stringify(fieldRules)||JSON.stringify(existing.actionRules)!==JSON.stringify(original.actionRules))throw Error('Existing v12 differs; refusing overwrite');
if(Number(company.activePolicyVersion)!==12){const r=d.form_analysis_companies.updateOne({_id:company._id,activePolicyVersion:company.activePolicyVersion},{$set:{activePolicyVersion:NumberLong('12')}});if(r.modifiedCount!==1)throw Error('Concurrent activation');}
if(!originals.every((p,i)=>EJSON.stringify(d.form_analysis_policies.findOne({_id:p._id}))===preserved[i]))throw Error('Previous policy changed');
const active=d.form_analysis_policies.findOne({companyKey:'hyundai',version:12});
print(JSON.stringify({activeVersion:Number(d.form_analysis_companies.findOne({companyKey:'hyundai'}).activePolicyVersion),preservedVersions:originals.map(p=>Number(p.version)),fieldRules:active.fieldRules.length,actionRules:active.actionRules.length,contractVersion:active.executionPolicy.browserPolicy.hiddenCodeContract.schemaVersion}));
`;
const r = spawnSync(
  "docker",
  [
    "exec",
    "2026-career-form-mongodb-1",
    "mongosh",
    "--quiet",
    "--eval",
    script,
  ],
  { stdio: "inherit" },
);
process.exitCode = r.status ?? 1;
