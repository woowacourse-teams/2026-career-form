import { spawnSync } from 'node:child_process';
const regions = {"region:seoul": "서울", "region:busan": "부산", "region:daegu": "대구", "region:incheon": "인천", "region:gwangju": "광주", "region:daejeon": "대전", "region:ulsan": "울산", "region:sejong": "세종", "region:gyeonggi": "경기", "region:gangwon": "강원", "region:chungbuk": "충북", "region:chungnam": "충남", "region:jeonbuk": "전북", "region:jeonnam": "전남", "region:gyeongbuk": "경북", "region:gyeongnam": "경남", "region:jeju": "제주", "region:overseas": "해외"};
const script = 'const regions='+JSON.stringify(regions)+';'+`
const d=db.getSiblingDB('career-form');
const c=d.form_analysis_companies.findOne({companyKey:'greeting'});
if(!c || ![5,6].includes(Number(c.activePolicyVersion))) throw Error('Unexpected active version');
const old=d.form_analysis_policies.findOne({companyKey:'greeting',version:5});
if(!old) throw Error('Missing v5');
const before=EJSON.stringify(old);
const next=EJSON.parse(before);
next._id='greeting-policy-v6'; next.version=NumberLong('6');
for(const r of next.fieldRules) if(r.structuralName.endsWith('.schoolLocation')) Object.assign(r.valueBinding.optionMap,regions);
for(const suffix of ['schoolLocation','attendanceType']) {
 const template=next.fieldRules.find(r=>r.structuralName==='educationalBackground.universities.*.'+suffix);
 if(!template) throw Error('Missing template '+suffix);
 const r=EJSON.parse(EJSON.stringify(template));
 r.structuralName='educationalBackground.highSchool.'+suffix;
 r.requiredDomName=r.structuralName; r.requiredItemGroupId='educationhighschool';
 r.valueBinding.profileFieldKey=r.valueBinding.profileFieldKey.replace('education.university.','education.highSchool.');
 next.fieldRules.push(r);
}
const existing=d.form_analysis_policies.findOne({_id:next._id});
if(!existing) d.form_analysis_policies.insertOne(next);
else if(EJSON.stringify(existing)!==EJSON.stringify(next)) throw Error('Existing v6 differs');
if(Number(c.activePolicyVersion)===5) {
 const r=d.form_analysis_companies.updateOne({_id:c._id,activePolicyVersion:c.activePolicyVersion},{$set:{activePolicyVersion:NumberLong('6')}});
 if(r.modifiedCount!==1)throw Error('Concurrent activation');
}
if(EJSON.stringify(d.form_analysis_policies.findOne({_id:old._id}))!==before)throw Error('Previous changed');
print(JSON.stringify({activeVersion:6,previousPreserved:true,fieldRules:next.fieldRules.length}));
`;
const r=spawnSync('docker',['exec','2026-career-form-mongodb-1','mongosh','--quiet','--eval',script],{stdio:'inherit'});
process.exitCode=r.status??1;
