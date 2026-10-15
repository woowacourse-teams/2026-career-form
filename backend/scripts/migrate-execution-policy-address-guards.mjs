// Explicit, local-only activation. Never invoked by server startup.
// The payload changes executionPolicy only; mapping/preparation inventories stay on the cloned live document.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const payload = JSON.parse(
  readFileSync(
    new URL("./execution-policy-address-guards-v1.json", import.meta.url),
    "utf8",
  ),
);
const dryRun = process.argv.includes("--dry-run");
const script = `
const payload=${JSON.stringify(payload)};
const dryRun=${dryRun};
const d=db.getSiblingDB('career-form');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const prepared=payload.changes.map(change=>{
 const company=d.form_analysis_companies.findOne({companyKey:change.key});
 if(!company || ![change.from,change.to].includes(Number(company.activePolicyVersion))) throw Error('Unexpected active version: '+change.key);
 const previous=d.form_analysis_policies.findOne({companyKey:change.key,version:change.from});
 if(!previous || !equal(previous.executionPolicy,change.expected)) throw Error('Concurrent policy change: '+change.key);
 const next={...previous,_id:change.key+'-policy-v'+change.to,version:NumberLong(String(change.to)),executionPolicy:change.next};
 const existing=d.form_analysis_policies.findOne({companyKey:change.key,version:change.to});
 if(existing && !equal(existing,next)) throw Error('Target version differs: '+change.key);
 return {change,company,next,existing};
});
if(!dryRun){
 for(const p of prepared) if(!p.existing) d.form_analysis_policies.insertOne(p.next);
 for(const {company,change} of prepared) if(Number(company.activePolicyVersion)===change.from){
  const result=d.form_analysis_companies.updateOne({_id:company._id,activePolicyVersion:company.activePolicyVersion},{$set:{activePolicyVersion:NumberLong(String(change.to))}});
  if(result.modifiedCount!==1) throw Error('Concurrent activation: '+change.key);
 }
}
print(JSON.stringify({dryRun,policies:prepared.map(({change,next})=>({company:change.key,previous:change.from,version:change.to,fieldRules:next.fieldRules.length,actionRules:next.actionRules.length}))}));
`;
const result = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    "2026-career-form-mongodb-1",
    "mongosh",
    "--quiet",
    "--file",
    "/dev/stdin",
  ],
  { input: script, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exitCode = result.status ?? 1;
