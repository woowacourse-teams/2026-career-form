// Explicit local migration; never called by server startup. Existing v28 is preserved.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const policy = JSON.parse(
  readFileSync(
    new URL(
      "../src/main/resources/policies/sk-browser-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const script =
  "const nextBrowserPolicy=" +
  JSON.stringify(policy) +
  ";\n" +
  `const d=db.getSiblingDB("career-form");
const company=d.form_analysis_companies.findOne({companyKey:"sk"});
if (!company || ![28,29].includes(Number(company.activePolicyVersion))) throw Error("Unexpected active SK version");
const original=d.form_analysis_policies.findOne({companyKey:"sk",version:28});
if (!original) throw Error("Missing preserved v28 policy");
const before=EJSON.stringify(original);
const next={...original,_id:"sk-policy-v29",version:NumberLong("29"),executionPolicy:{...original.executionPolicy,browserPolicy:nextBrowserPolicy}};
next.fieldRules=original.fieldRules.map(r=>["eduhgFromDate"].includes(r.structuralName)?{...r,valueBinding:{profileFieldKey:r.valueBinding.profileFieldKey,recipe:"YEAR_MONTH",_class:"com.careerform.formanalysis.application.port.FieldMappingResolver$DerivedBinding"}}:r);
const existing=d.form_analysis_policies.findOne({companyKey:"sk",version:29});
if (!existing) d.form_analysis_policies.insertOne(next);
else if (JSON.stringify(existing.executionPolicy)!==JSON.stringify(next.executionPolicy)||JSON.stringify(existing.fieldRules)!==JSON.stringify(next.fieldRules)) throw Error("Existing v29 differs; refusing overwrite");
if (Number(company.activePolicyVersion)===28) {
 const updated=d.form_analysis_companies.updateOne({_id:company._id,activePolicyVersion:company.activePolicyVersion},{$set:{activePolicyVersion:NumberLong("29")}});
 if(updated.modifiedCount!==1) throw Error("Concurrent activation");
}
if(EJSON.stringify(d.form_analysis_policies.findOne({_id:original._id}))!==before)throw Error("Previous policy changed");
print(JSON.stringify({activeVersion:Number(d.form_analysis_companies.findOne({companyKey:"sk"}).activePolicyVersion),preservedV28:true,dates:d.form_analysis_policies.findOne({companyKey:"sk",version:29}).fieldRules.filter(r=>/eduhgFromDate/.test(r.structuralName))}));
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
