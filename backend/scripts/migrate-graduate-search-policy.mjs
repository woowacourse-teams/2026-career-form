import {spawnSync} from 'node:child_process';
const script=String.raw`
const d=db.getSiblingDB('career-form');
const regions={seoul:'서울',busan:'부산',daegu:'대구',incheon:'인천',gwangju:'광주',daejeon:'대전',ulsan:'울산',sejong:'세종',gyeonggi:'경기',gangwon:'강원',chungbuk:'충북',chungnam:'충남',jeonbuk:'전북',jeonnam:'전남',gyeongbuk:'경북',gyeongnam:'경남',jeju:'제주',overseas:'해외'};
for(const [key,from,to] of [['sk',30,32],['hyundai',14,15]]){
 const c=d.form_analysis_companies.findOne({companyKey:key});
 if(!c||![from,to,...(key==='sk'?[31]:[])].includes(Number(c.activePolicyVersion)))throw Error('Unexpected active '+key);
 const old=d.form_analysis_policies.findOne({companyKey:key,version:from});if(!old)throw Error('Missing '+key);
 const before=EJSON.stringify(old),next=EJSON.parse(before);
 next._id=key+'-policy-v'+to;next.version=NumberLong(String(to));
 for(const r of next.fieldRules){const b=r.valueBinding;
  if(typeof b.profileFieldKey==='string' && b.profileFieldKey.endsWith('.attendanceType')&&b.optionMap){b.optionMap['attendance:day']='주간';b.optionMap['attendance:night']='야간';}
  if(typeof b.profileFieldKey==='string' && b.profileFieldKey.endsWith('.schoolRegion')&&b.optionMap)for(const [code,label] of Object.entries(regions))if(b.optionMap[label]!==undefined)b.optionMap['region:'+code]=b.optionMap[label];
 }
 if(key==='sk'){
  const bp=next.executionPolicy.browserPolicy;
  for(const [name,keyPart] of [['edugdFromDate','startDate'],['edugdToDate','endDate']]){
   const field=next.fieldRules.find(r=>r.structuralName===name);if(!field)throw Error('Missing date');
   field.valueBinding={profileFieldKey:'education.graduateSchool.'+keyPart,recipe:'YEAR_MONTH',_class:'com.careerform.formanalysis.application.port.FieldMappingResolver$DerivedBinding'};
   const template=bp.fields.find(r=>r.name==='eduFromDate');if(!template)throw Error('Missing month template');
   bp.fields.push({...template,name,key:'education.graduateSchool.'+keyPart});
  }

 }
 const existing=d.form_analysis_policies.findOne({_id:next._id});
 if(!existing)d.form_analysis_policies.insertOne(next);else if(EJSON.stringify(existing)!==EJSON.stringify(next))throw Error('Different existing '+key);
 if(Number(c.activePolicyVersion)!==to){const r=d.form_analysis_companies.updateOne({_id:c._id,activePolicyVersion:c.activePolicyVersion},{$set:{activePolicyVersion:NumberLong(String(to))}});if(r.modifiedCount!==1)throw Error('Concurrent change');}
 if(EJSON.stringify(d.form_analysis_policies.findOne({_id:old._id}))!==before)throw Error('Previous changed');
 print(JSON.stringify({key,version:to,previousPreserved:true}));
}
`;
const r=spawnSync('docker',['exec','2026-career-form-mongodb-1','mongosh','--quiet','--eval',script],{stdio:'inherit'});process.exitCode=r.status??1;
