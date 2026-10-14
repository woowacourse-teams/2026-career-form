// Explicit local-only migration; clone active documents and preserve their rule inventories.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const delta = JSON.parse(
  readFileSync(
    new URL("./execution-policy-behavior-v1.json", import.meta.url),
    "utf8",
  ),
);
const script = `
const delta=${JSON.stringify(delta)};
const d=db.getSiblingDB("career-form");
const changes=[{key:"sk",from:35,to:36},{key:"hyundai",from:19,to:20},{key:"greeting",from:13,to:14}];
const prepared=changes.map(change=>{
 const company=d.form_analysis_companies.findOne({companyKey:change.key});
 if(!company || ![change.from,change.to].includes(Number(company.activePolicyVersion))) throw Error("Unexpected active version: "+change.key);
 const previous=d.form_analysis_policies.findOne({companyKey:change.key,version:change.from});
 if(!previous) throw Error("Missing previous policy: "+change.key);
 const next={...previous,_id:change.key+"-policy-v"+change.to,version:NumberLong(String(change.to)),executionPolicy:JSON.parse(JSON.stringify(previous.executionPolicy))};
 const target=next.executionPolicy.componentPolicy ?? next.executionPolicy.browserPolicy;
 if(!target) throw Error("Missing execution engine: "+change.key);
 target.runtimeRules=delta[change.key];
 const existing=d.form_analysis_policies.findOne({companyKey:change.key,version:change.to});
 if(existing && JSON.stringify(existing.executionPolicy)!==JSON.stringify(next.executionPolicy)) throw Error("Target version differs: "+change.key);
 return {change,company,next,existing};
});
for(const p of prepared) if(!p.existing) d.form_analysis_policies.insertOne(p.next);
for(const {change,company} of prepared) {
 if(Number(company.activePolicyVersion)===change.from) {
   const result=d.form_analysis_companies.updateOne({_id:company._id,activePolicyVersion:company.activePolicyVersion},{$set:{activePolicyVersion:NumberLong(String(change.to))}});
   if(result.modifiedCount!==1) throw Error("Concurrent activation: "+change.key);
 }
 print(JSON.stringify({company:change.key,activeVersion:change.to,preservedVersion:change.from}));
}
`;
const result = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    "2026-career-form-mongodb-1",
    "mongosh",
    "--quiet",
    "--eval",
    script,
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
