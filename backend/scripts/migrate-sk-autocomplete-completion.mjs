// Explicit local migration. Preserve v34; no startup overwrite.
import { spawnSync } from "node:child_process";
const script = `
const d=db.getSiblingDB("career-form");
const c=d.form_analysis_companies.findOne({companyKey:"sk"});
if (!c || ![34,35].includes(Number(c.activePolicyVersion))) throw Error("Unexpected SK version");
const old=d.form_analysis_policies.findOne({companyKey:"sk",version:34});
if (!old) throw Error("Missing v34");
const next={...old,_id:"sk-policy-v35",version:NumberLong("35"),executionPolicy:{...old.executionPolicy,browserPolicy:{...old.executionPolicy.browserPolicy,completionAutocompleteSelector:"input.ui-autocomplete-input"}}};
const existing=d.form_analysis_policies.findOne({companyKey:"sk",version:35});
if(!existing) d.form_analysis_policies.insertOne(next);
else if(JSON.stringify(existing.executionPolicy)!==JSON.stringify(next.executionPolicy)) throw Error("Existing v35 differs");
if(Number(c.activePolicyVersion)===34) {
 const r=d.form_analysis_companies.updateOne({_id:c._id,activePolicyVersion:c.activePolicyVersion},{$set:{activePolicyVersion:NumberLong("35")}});
 if(r.modifiedCount!==1) throw Error("Concurrent activation");
}
print(JSON.stringify({activeVersion:Number(d.form_analysis_companies.findOne({companyKey:"sk"}).activePolicyVersion),selector:next.executionPolicy.browserPolicy.completionAutocompleteSelector,preservedV34:true}));
`;
const result=spawnSync("docker",["exec","-i","2026-career-form-mongodb-1","mongosh","--quiet","--eval",script],{stdio:"inherit"});
process.exitCode=result.status ?? 1;
