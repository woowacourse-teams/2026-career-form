import {spawnSync} from 'node:child_process';
const script=String.raw`
const d=db.getSiblingDB('career-form'),cls='com.careerform.formanalysis.application.port.FieldMappingResolver$';
const copy=x=>EJSON.parse(EJSON.stringify(x));
for(const [key,from,to] of [['sk',33,34],['hyundai',16,17]]){
 const c=d.form_analysis_companies.findOne({companyKey:key});
 if(!c||![from,to].includes(Number(c.activePolicyVersion)))throw Error('Unexpected '+key);
 const old=d.form_analysis_policies.findOne({companyKey:key,version:from});if(!old)throw Error('Missing previous');
 const before=EJSON.stringify(old),next=copy(old);next._id=key+'-policy-v'+to;next.version=NumberLong(String(to));
 if(key==='sk'){
  for(const [name,options] of [
   ['edugdEducationType',{'석사':'대학원(석사)','박사':'대학원(박사)','석박사통합':'대학원(석박사통합)','석박사 통합':'대학원(석박사통합)','대학원(석사)':'대학원(석사)','대학원(박사)':'대학원(박사)','대학원(석박사통합)':'대학원(석박사통합)'}],
   ['edugdCreditBase',{'4':'4.00','4.0':'4.00','4.00':'4.00','4.3':'4.30','4.30':'4.30','4.5':'4.50','4.50':'4.50','100':'100.00','100.0':'100.00','100.00':'100.00'}]
  ]){const r=next.fieldRules.find(r=>r.structuralName===name);if(!r)throw Error('Missing '+name);r.valueBinding={profileFieldKey:r.valueBinding.profileFieldKey,optionMap:options,_class:cls+'LookupBinding'};}
  for(const [name,field] of [['edugdProfessor','labProfessorName'],['edugdLabName','labName'],['edugdResearch','researchField']]){
   if(next.fieldRules.some(r=>r.structuralName===name))throw Error('Duplicate '+name);
   next.fieldRules.push({structuralName:name,element:'INPUT',control:'TEXT',valueBinding:{profileFieldKey:'education.graduateSchool.'+field,_class:cls+'DirectBinding'},allowReadonlyWrite:false});
  }
 } else {
  const b=next.executionPolicy.browserPolicy.hiddenCodeContract.behavior;
  const convert=x=>JSON.parse(JSON.stringify(x).replaceAll('education.university.','education.graduateSchool.').replaceAll('educationuniversity','educationgraduateschool'));
  for(const field of ['rcdPerf','dblMajorNm','minorNm']){
   const r=next.fieldRules.find(r=>r.structuralName===field&&r.requiredItemGroupId==='educationuniversity');if(!r)throw Error('Missing '+field);
   next.fieldRules.push(convert(r));
  }
  for(const r of next.fieldRules.filter(r=>r.structuralName==='rcdPerf')){
   Object.assign(r.valueBinding.optionMap,{'4':'4.0','4.0':'4.0','4.3':'4.3','4.5':'4.5','5':'5.0','5.0':'5.0','5.00':'5.0','100':'100','100.0':'100'});
   r.valueBinding.optionCodeMap['5.0']='5';
  }
  const gpa=b.codedButtons.find(r=>r.key==='education.university.gpaScale');if(!gpa)throw Error('Missing GPA executor');
  gpa.codes['5.0']='5';b.codedButtons.push(convert(gpa));
  next.fieldRules.push({structuralName:'docCombYn',element:'INPUT',control:'BUTTON',valueBinding:{profileFieldKey:'education.graduateSchool.combinedDegreeStatus',optionMap:{'예':'예','아니오':'아니오'},optionCodeMap:{'예':'Y','아니오':'N'},_class:cls+'ButtonOptionBinding'},allowReadonlyWrite:false,requiredItemGroupId:'educationgraduateschool'});
  b.codedButtons.push({key:'education.graduateSchool.combinedDegreeStatus',group:'educationgraduateschool',idPattern:'^docCombYn_([1-9][0-9]*)$',attributes:{'data-codegb':'0129'},hiddenSelector:":scope > input[type='hidden'].js-field[name='docCombYn']",codes:{'예':'Y','아니오':'N'}});
  for(const list of ['searches','drivers','failureScopes'])for(const r of [...b[list]])if(r.group==='educationuniversity'&&['education.university.additionalMajorName','education.university.minorName'].includes(r.key??r.profileFieldKey))b[list].push(convert(r));
  const school=b.searches.find(r=>r.profileFieldKey==='education.graduateSchool.schoolName');
  if(!school?.resultMatch||school.resultMatch.separator!==' - ')throw Error('Missing graduate school name-region match');
 }
 const existing=d.form_analysis_policies.findOne({_id:next._id});if(!existing)d.form_analysis_policies.insertOne(next);else if(EJSON.stringify(existing)!==EJSON.stringify(next))throw Error('New version differs');
 if(Number(c.activePolicyVersion)===from){const r=d.form_analysis_companies.updateOne({_id:c._id,activePolicyVersion:c.activePolicyVersion},{$set:{activePolicyVersion:NumberLong(String(to))}});if(r.modifiedCount!==1)throw Error('Concurrent activation');}
 if(EJSON.stringify(d.form_analysis_policies.findOne({_id:old._id}))!==before)throw Error('Previous changed');
 print(JSON.stringify({key,version:to,fieldRules:next.fieldRules.length,previousPreserved:true}));
}
`;
const r=spawnSync('docker',['exec','2026-career-form-mongodb-1','mongosh','--quiet','--eval',script],{stdio:'inherit'});process.exitCode=r.status??1;
