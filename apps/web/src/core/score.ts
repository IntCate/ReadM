export const LIMITS={maxBytes:10*1024*1024,maxMeasures:1000,maxEvents:200000,maxChordNotes:32,maxDepth:64} as const;
export type Hand = 'right'|'left';
export type Rational={n:number;d:number};
export type Pitch={step:string;alter:number;octave:number};
export type Note={id:string;pitch:Pitch;velocity?:number};
export type Written={base:number;dots:number;tupletId?:string};
export type ScoreEvent={id:string;measureId:string;staffId:string;voiceId:string;hand:Hand;onset:Rational;duration:Rational;kind:'chord'|'rest';written:Written;notes:Note[]};
export type Measure={id:string;order:number;meter:[number,number];key:number;minor:boolean;actualLength:Rational};
export type Score={id:string;title:string;parts:{id:string;instrument:'piano';staves:{id:string;defaultClef:string;defaultHand:Hand}[];voices:{id:string;partId:string;defaultStaffId:string}[]}[];measures:Measure[];events:ScoreEvent[];ties:{id:string;fromNoteId:string;toNoteId:string}[];slurs:{id:string;fromEventId:string;toEventId:string}[];tuplets:{id:string;eventIds:string[];actual:number;normal:number}[];tempoMap:{measureId:string;onset:Rational;quarterBpm:number}[];repeatRegions:{id:string;startMeasureId:string;endMeasureId:string;count:number}[];notationPolicy:{jianpuMode:'relative-major';referencePitch:string}};
export type Project={format:'piano-score-project';schemaVersion:1;projectId:string;sourceProjectId?:string;revision:number;updatedAt:string;score:Score};
export const id=()=>crypto.randomUUID();
const gcd=(a:number,b:number):number=>b?gcd(b,a%b):Math.abs(a)||1;
export function rat(n:number,d=1):Rational {if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||d<=0)throw Error('时值不是有效的有理数');const g=gcd(n,d);return {n:n/g,d:d/g};}
export const val=(r:Rational)=>r.n/r.d;
export const add=(a:Rational,b:Rational)=>rat(a.n*b.d+b.n*a.d,a.d*b.d);
export const sub=(a:Rational,b:Rational)=>rat(a.n*b.d-b.n*a.d,a.d*b.d);
export const eq=(a:Rational,b:Rational)=>a.n*b.d===b.n*a.d;
export const dur=(base:number,dots=0,triplet=false)=>rat(4*(dots?3:1)*(triplet?2:1),base*(dots?2:1)*(triplet?3:1));
export const STEPS=['C','D','E','F','G','A','B'];
const SEMITONES=[0,2,4,5,7,9,11];
export const midi=(p:Pitch)=>12*(p.octave+1)+SEMITONES[STEPS.indexOf(p.step)]+p.alter;
export const pitchName=(p:Pitch)=>`${p.step}${p.alter===1?'♯':p.alter===-1?'♭':''}${p.octave}`;
export const pitchKey=(p:Pitch)=>`${p.step}${p.alter}/${p.octave}`;
export const MAJOR=['C♭','G♭','D♭','A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯'];
export const MINOR=['a♭','e♭','b♭','f','c','g','d','a','e','b','f♯','c♯','g♯','d♯','a♯'];
export const VEX_KEYS=['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#'];
export function keyAlter(step:string,key:number){const order=key>0?['F','C','G','D','A','E','B']:['B','E','A','D','G','C','F'];return order.slice(0,Math.abs(key)).includes(step)?Math.sign(key):0;}
export function jianpu(p:Pitch,key:number){const tonicSteps=['C','G','D','A','E','B','F','C','G','D','A','E','B','F','C'];const tonic=STEPS.indexOf(tonicSteps[key+7]);const delta=STEPS.indexOf(p.step)-tonic;return {digit:(delta+7)%7+1,octave:p.octave-4+Math.floor(delta/7),accidental:p.alter-keyAlter(p.step,key)};}
export function fromJianpu(digit:number,octave:number,alter:number,key:number):Pitch {const tonic=['C','G','D','A','E','B','F','C','G','D','A','E','B','F','C'][key+7];const i=STEPS.indexOf(tonic)+digit-1;const step=STEPS[i%7];return {step,octave:4+octave+Math.floor(i/7),alter:keyAlter(step,key)+alter};}
export const line=(s:Score,m:string,h:Hand)=>s.events.filter(e=>e.measureId===m&&e.hand===h).sort((a,b)=>val(a.onset)-val(b.onset));
export const clone=<T,>(x:T):T=>structuredClone(x);
export function makeEvent(m:string,h:Hand,onset:Rational,duration:Rational,notes:Pitch[]=[],written:Written={base:4,dots:0}):ScoreEvent{return {id:id(),measureId:m,staffId:`staff-${h}`,voiceId:`voice-${h}`,hand:h,onset,duration,kind:notes.length?'chord':'rest',written,notes:notes.map(p=>({id:id(),pitch:clone(p)}))};}

// Decompose exact durations; never round musical positions to floating-point grids.
export function pieces(length:Rational,triplet=false):{duration:Rational;written:Written}[]{
  let remaining=length;const out:{duration:Rational;written:Written}[]=[];
  const choices=[1,2,4,8,16,32].flatMap(base=>[1,0].map(dots=>({duration:dur(base,dots,triplet),written:{base,dots}}))).sort((a,b)=>val(b.duration)-val(a.duration));
  while(val(remaining)>0){const choice=choices.find(c=>val(c.duration)<=val(remaining)+1e-9);if(!choice||out.length>256)throw Error('这个时值无法用当前支持的音符表示，请调整时值或三连音网格');out.push(clone(choice));remaining=sub(remaining,choice.duration);}
  return out;
}
function span(s:Score,m:Measure,h:Hand,start:Rational,length:Rational,pitches:Pitch[],triplet=false){
  const result:ScoreEvent[]=[];let onset=start;
  for(const p of pieces(length,triplet)){const e=makeEvent(m.id,h,onset,p.duration,pitches,p.written);if(triplet){const group=id();e.written.tupletId=group;s.tuplets.push({id:group,eventIds:[e.id],actual:3,normal:2});}result.push(e);onset=add(onset,p.duration);}
  result.slice(1).forEach((e,i)=>e.notes.forEach((n,j)=>s.ties.push({id:id(),fromNoteId:result[i].notes[j].id,toNoteId:n.id})));
  return result;
}
export function createProject(title='未命名钢琴曲',count=8,meter:[number,number]=[4,4],key=0,minor=false,bpm=88):Project {
  const score:Score={id:id(),title,parts:[{id:'piano',instrument:'piano',staves:[{id:'staff-right',defaultClef:'treble',defaultHand:'right'},{id:'staff-left',defaultClef:'bass',defaultHand:'left'}],voices:[{id:'voice-right',partId:'piano',defaultStaffId:'staff-right'},{id:'voice-left',partId:'piano',defaultStaffId:'staff-left'}]}],measures:[],events:[],ties:[],slurs:[],tuplets:[],tempoMap:[],repeatRegions:[],notationPolicy:{jianpuMode:'relative-major',referencePitch:'C4'}};
  for(let i=0;i<count;i++){const m:Measure={id:id(),order:i,meter:[...meter],key,minor,actualLength:rat(meter[0]*4,meter[1])};score.measures.push(m);for(const h of ['right','left'] as Hand[])score.events.push(...span(score,m,h,rat(0),m.actualLength,[]));}
  score.tempoMap.push({measureId:score.measures[0].id,onset:rat(0),quarterBpm:bpm});return {format:'piano-score-project',schemaVersion:1,projectId:id(),revision:0,updatedAt:new Date().toISOString(),score};
}
function tidy(s:Score){
  const notes=new Set(s.events.flatMap(e=>e.notes.map(n=>n.id)));const events=new Set(s.events.map(e=>e.id));
  s.ties=s.ties.filter(t=>notes.has(t.fromNoteId)&&notes.has(t.toNoteId));s.slurs=s.slurs.filter(t=>events.has(t.fromEventId)&&events.has(t.toEventId));
  s.tuplets=s.tuplets.map(t=>({...t,eventIds:t.eventIds.filter(e=>events.has(e))})).filter(t=>t.eventIds.length);
}
export function commit(p:Project,fn:(s:Score)=>void):Project {const next=clone(p);fn(next.score);tidy(next.score);next.revision=p.revision+1;next.updatedAt=new Date().toISOString();validate(next);return next;}
function overwriteInMeasure(s:Score,m:Measure,h:Hand,start:Rational,length:Rational,insert:ScoreEvent[]){
  const end=add(start,length);const old=line(s,m.id,h);const keep:ScoreEvent[]=[];
  for(const e of old){const stop=add(e.onset,e.duration);if(val(stop)<=val(start)||val(e.onset)>=val(end)){keep.push(e);continue;}
    const split=(onset:Rational,duration:Rational,side:'start'|'end')=>{const fragments=span(s,m,h,onset,duration,e.notes.map(n=>n.pitch),!!e.written.tupletId);keep.push(...fragments);if(fragments.length){e.notes.forEach((n,i)=>{if(side==='start')s.ties.forEach(t=>{if(t.toNoteId===n.id)t.toNoteId=fragments[0].notes[i]?.id;});else s.ties.forEach(t=>{if(t.fromNoteId===n.id)t.fromNoteId=fragments.at(-1)!.notes[i]?.id;});});}};
    if(val(e.onset)<val(start))split(e.onset,sub(start,e.onset),'start');if(val(stop)>val(end))split(end,sub(stop,end),'end');
  }
  s.events=s.events.filter(e=>!(e.measureId===m.id&&e.hand===h));s.events.push(...keep,...insert);
}
export function setEvent(p:Project,measureId:string,hand:Hand,onset:Rational,pitches:Pitch[],base:number,dots=0,triplet=false):Project{
  return commit(p,s=>{let index=s.measures.findIndex(m=>m.id===measureId);if(index<0)throw Error('小节不存在');let remaining=triplet?dur(base,dots):dur(base,dots);let pos=onset;const created:ScoreEvent[]=[];const group=triplet?id():null;
    // Tuplet entry creates one complete 3:2 group in one transaction.
    const total=triplet?add(add(dur(base,dots,true),dur(base,dots,true)),dur(base,dots,true)):remaining;remaining=total;
    if(val(onset)<0||val(onset)>=val(s.measures[index].actualLength))throw Error('请选择小节内的有效位置');
    while(val(remaining)>0){if(index>=LIMITS.maxMeasures)throw Error('已达到 1000 小节上限');if(!s.measures[index]){const prev=s.measures.at(-1)!;const m={...clone(prev),id:id(),order:index};s.measures.push(m);for(const h of ['right','left'] as Hand[])s.events.push(...span(s,m,h,rat(0),m.actualLength,[]));}
      const m=s.measures[index];const available=sub(m.actualLength,pos);const length=val(remaining)<val(available)?remaining:available;
      let incoming:ScoreEvent[];
      if(triplet){if(!eq(length,total))throw Error('请将三连音组放在同一小节内');incoming=[0,1,2].map(i=>makeEvent(m.id,hand,add(pos,rat(dur(base,dots,true).n*i,dur(base,dots,true).d)),dur(base,dots,true),pitches,{base,dots,tupletId:group!}));s.tuplets.push({id:group!,eventIds:incoming.map(e=>e.id),actual:3,normal:2});}
      else incoming=span(s,m,hand,pos,length,pitches);
      overwriteInMeasure(s,m,hand,pos,length,incoming);created.push(...incoming);remaining=sub(remaining,length);pos=rat(0);index++;
    }
    if(!triplet)created.slice(1).forEach((e,i)=>{if(created[i].measureId!==e.measureId)e.notes.forEach((n,j)=>s.ties.push({id:id(),fromNoteId:created[i].notes[j].id,toNoteId:n.id}));});
  });
}
export function changePitch(p:Project,eventId:string,noteIndex:number,pitch:Pitch):Project{return commit(p,s=>{const e=s.events.find(e=>e.id===eventId);if(!e)throw Error('请先选择音符');if(e.kind==='rest'){e.kind='chord';e.notes=[{id:id(),pitch}];return;}const note=e.notes[noteIndex];if(!note)throw Error('未选中音符');const connected=new Set([note.id]);let size=0;while(size!==connected.size){size=connected.size;s.ties.forEach(t=>{if(connected.has(t.fromNoteId)||connected.has(t.toNoteId)){connected.add(t.fromNoteId);connected.add(t.toNoteId);}});}s.events.forEach(e=>e.notes.forEach(n=>{if(connected.has(n.id))n.pitch=clone(pitch);}));});}
export function addChord(p:Project,eventId:string,pitch:Pitch):Project{return commit(p,s=>{const e=s.events.find(e=>e.id===eventId);if(!e||e.kind==='rest')throw Error('请先选择一个有音高的音符');if(e.notes.some(n=>midi(n.pitch)===midi(pitch)))throw Error('和弦内已存在这个音高');e.notes.push({id:id(),pitch});});}
export function deleteEvents(p:Project,eventIds:string[]):Project{return commit(p,s=>{s.events.forEach(e=>{if(eventIds.includes(e.id)){e.notes=[];e.kind='rest';}});});}
export function removePitch(p:Project,eventId:string,noteIndex:number):Project{return commit(p,s=>{const e=s.events.find(e=>e.id===eventId);if(!e)throw Error('未选择事件');e.notes.splice(noteIndex,1);if(!e.notes.length)e.kind='rest';});}
export function toggleTie(p:Project,a:string,b:string):Project{return commit(p,s=>{const first=s.events.find(e=>e.id===a),second=s.events.find(e=>e.id===b);if(!first||!second||first.hand!==second.hand||!first.notes.length)throw Error('请选择同一只手连续的两个音符');const ordered=s.measures.flatMap(m=>line(s,m.id,first.hand));if(ordered.indexOf(second)!==ordered.indexOf(first)+1)throw Error('延音线只能连接连续音符');const pairs=first.notes.map(n=>[n,second.notes.find(x=>pitchKey(x.pitch)===pitchKey(n.pitch))] as const);if(pairs.some(([,n])=>!n))throw Error('延音的两端必须是相同拼写的音高');const existing=s.ties.filter(t=>pairs.some(([a,b])=>t.fromNoteId===a.id&&t.toNoteId===b!.id));if(existing.length)s.ties=s.ties.filter(t=>!existing.includes(t));else pairs.forEach(([a,b])=>s.ties.push({id:id(),fromNoteId:a.id,toNoteId:b!.id}));});}
export function toggleSlur(p:Project,a:string,b:string):Project{return commit(p,s=>{const x=s.events.find(e=>e.id===a),y=s.events.find(e=>e.id===b);if(!x||!y||x.hand!==y.hand||x.id===y.id||x.kind==='rest'||y.kind==='rest')throw Error('请选择同一只手的两个音符');const existing=s.slurs.find(t=>t.fromEventId===a&&t.toEventId===b);if(existing)s.slurs=s.slurs.filter(t=>t!==existing);else s.slurs.push({id:id(),fromEventId:a,toEventId:b});});}
export function appendMeasure(p:Project):Project{return commit(p,s=>{if(s.measures.length>=LIMITS.maxMeasures)throw Error('最多支持 1000 小节');const m={...clone(s.measures.at(-1)!),id:id(),order:s.measures.length};s.measures.push(m);for(const h of ['right','left'] as Hand[])s.events.push(...span(s,m,h,rat(0),m.actualLength,[]));});}
export function setContext(p:Project,measureId:string,options:{meter?:[number,number];key?:number;minor?:boolean;length?:Rational;bpm?:number}):Project{return commit(p,s=>{const m=s.measures.find(m=>m.id===measureId)!;if(options.key!==undefined)m.key=options.key;if(options.minor!==undefined)m.minor=options.minor;if(options.bpm!==undefined){s.tempoMap=s.tempoMap.filter(t=>t.measureId!==m.id);s.tempoMap.push({measureId:m.id,onset:rat(0),quarterBpm:options.bpm});}if(options.meter||options.length){const meter=options.meter??m.meter;const length=options.length??rat(meter[0]*4,meter[1]);if(val(length)>meter[0]*4/meter[1])throw Error('弱起长度不能超过拍号长度');for(const h of ['right','left'] as Hand[]){const old=line(s,m.id,h);if(old.some(e=>e.kind==='chord'&&val(add(e.onset,e.duration))>val(length)))throw Error('新拍号会截断音符，请先移动或删除超出部分');const end=old.reduce((max,e)=>Math.max(max,val(add(e.onset,e.duration))),0);if(val(length)<end)overwriteInMeasure(s,m,h,length,sub(m.actualLength,length),[]);else if(val(length)>end)s.events.push(...span(s,m,h,rat(Math.round(end*96),96),sub(length,m.actualLength),[]));}m.meter=meter;m.actualLength=length;}});}
export function setRepeat(p:Project,start:string,end:string):Project{return commit(p,s=>{const a=s.measures.findIndex(m=>m.id===start),b=s.measures.findIndex(m=>m.id===end);if(a<0||b<a)throw Error('反复范围无效');const existing=s.repeatRegions.find(r=>r.startMeasureId===start&&r.endMeasureId===end);if(existing){s.repeatRegions=s.repeatRegions.filter(r=>r!==existing);return;}if(s.repeatRegions.some(r=>{const x=s.measures.findIndex(m=>m.id===r.startMeasureId),y=s.measures.findIndex(m=>m.id===r.endMeasureId);return a<=y&&b>=x;}))throw Error('当前不支持重叠或嵌套反复');s.repeatRegions.push({id:id(),startMeasureId:start,endMeasureId:end,count:2});});}
export function copyMeasures(p:Project,start:number,end:number){return {score:clone(p.score),start,end};}
export function pasteMeasures(p:Project,clip:ReturnType<typeof copyMeasures>,target:number,hand:Hand|'both'):Project{return commit(p,s=>{const source=clip.score.measures.slice(clip.start,clip.end+1);if(target+source.length>s.measures.length)throw Error('目标小节不足，请先添加小节');const eMap=new Map<string,string>(),nMap=new Map<string,string>(),tMap=new Map<string,string>();source.forEach((m,i)=>{const dest=s.measures[target+i];if(!eq(m.actualLength,dest.actualLength))throw Error('复制的小节时长与目标不同');for(const h of ['right','left'] as Hand[]){if(hand!=='both'&&hand!==h)continue;const copied=line(clip.score,m.id,h).map(e=>{const n=clone(e);n.id=id();eMap.set(e.id,n.id);n.measureId=dest.id;n.notes.forEach(note=>{const old=note.id;note.id=id();nMap.set(old,note.id);});if(n.written.tupletId){if(!tMap.has(n.written.tupletId))tMap.set(n.written.tupletId,id());n.written.tupletId=tMap.get(n.written.tupletId);}return n;});overwriteInMeasure(s,dest,h,rat(0),dest.actualLength,copied);}});clip.score.ties.forEach(t=>{if(nMap.has(t.fromNoteId)&&nMap.has(t.toNoteId))s.ties.push({id:id(),fromNoteId:nMap.get(t.fromNoteId)!,toNoteId:nMap.get(t.toNoteId)!});});clip.score.slurs.forEach(t=>{if(eMap.has(t.fromEventId)&&eMap.has(t.toEventId))s.slurs.push({id:id(),fromEventId:eMap.get(t.fromEventId)!,toEventId:eMap.get(t.toEventId)!});});clip.score.tuplets.forEach(t=>{if(tMap.has(t.id))s.tuplets.push({id:tMap.get(t.id)!,eventIds:t.eventIds.map(e=>eMap.get(e)).filter(Boolean) as string[],actual:3,normal:2});});});}

export function validate(input:unknown):asserts input is Project{
  const p=input as Project;const fail=(message:string):never=>{throw Error(message);};const keys=(object:unknown,allowed:string[],label:string)=>{if(!object||typeof object!=='object'||Array.isArray(object))fail(label+'结构无效');for(const key of Object.keys(object!))if(key!=='extensions'&&!allowed.includes(key))fail(label+'包含不支持字段：'+key);};
  if(!p||p.format!=='piano-score-project')fail('不是谱间项目文件');if(p.schemaVersion!==1)fail('项目版本不兼容，原文件未被更改');
  if(typeof p.projectId!=='string'||!p.projectId||!Number.isSafeInteger(p.revision)||p.revision<0||typeof p.updatedAt!=='string')fail('项目元数据无效');
  keys(p,['format','schemaVersion','projectId','sourceProjectId','revision','updatedAt','score'],'项目');const s=p.score;if(!s||typeof s.title!=='string'||s.title.length>200||!Array.isArray(s.measures)||s.measures.length<1||s.measures.length>LIMITS.maxMeasures||!Array.isArray(s.events)||s.events.length>LIMITS.maxEvents)fail('项目结构或大小超出支持范围');
  if(!Array.isArray(s.parts)||s.parts.length!==1||s.parts[0].instrument!=='piano'||!Array.isArray(s.ties)||!Array.isArray(s.slurs)||!Array.isArray(s.tuplets)||!Array.isArray(s.tempoMap)||!Array.isArray(s.repeatRegions)||s.notationPolicy?.jianpuMode!=='relative-major')fail('乐谱结构不完整或包含不支持的乐器/记法');
  keys(s,['id','title','parts','measures','events','ties','slurs','tuplets','tempoMap','repeatRegions','notationPolicy'],'乐谱');const part=s.parts[0];if(part.id!=='piano'||!Array.isArray(part.staves)||part.staves.length!==2||!Array.isArray(part.voices)||part.voices.length!==2||!['right','left'].every(h=>part.staves.some(st=>st.id===`staff-${h}`&&st.defaultHand===h)&&part.voices.some(v=>v.id===`voice-${h}`&&v.partId==='piano'&&v.defaultStaffId===`staff-${h}`)))fail('当前只支持每手一个声部的双手钢琴谱');const seen=new Set<string>();const checkId=(x:string)=>{if(typeof x!=='string'||!x||seen.has(x))fail('项目存在空或重复 ID');seen.add(x);};checkId(s.id);
  const rational=(r:Rational)=>{if(!r||!Number.isSafeInteger(r.n)||!Number.isSafeInteger(r.d)||r.d<1||r.d>1000000||Math.abs(r.n)>1000000)fail('非法节拍有理数');};
  const ms=new Map<string,Measure>();s.measures.forEach((m,i)=>{keys(m,['id','order','meter','key','minor','actualLength'],'小节');checkId(m.id);rational(m.actualLength);if(m.order!==i||![[2,4],[3,4],[4,4],[6,8]].some(x=>x[0]===m.meter?.[0]&&x[1]===m.meter?.[1])||val(m.actualLength)<=0||val(m.actualLength)>m.meter[0]*4/m.meter[1]||!Number.isInteger(m.key)||Math.abs(m.key)>7||typeof m.minor!=='boolean')fail('小节拍号、调号或长度不合法');ms.set(m.id,m);});
  const grouped=new Map<string,ScoreEvent[]>();const noteMap=new Map<string,{note:Note;event:ScoreEvent}>();const eventMap=new Map<string,ScoreEvent>();
  const tupleMap=new Map(s.tuplets.map(t=>[t.id,t]));let noteCount=0;
  s.events.forEach(e=>{keys(e,['id','measureId','staffId','voiceId','hand','onset','duration','kind','written','notes'],'音符事件');checkId(e.id);eventMap.set(e.id,e);const groupKey=e.measureId+':'+e.hand;const groupEvents=grouped.get(groupKey)??[];groupEvents.push(e);grouped.set(groupKey,groupEvents);const m=ms.get(e.measureId);if(!m||!['right','left'].includes(e.hand)||e.staffId!==`staff-${e.hand}`||e.voiceId!==`voice-${e.hand}`||!['chord','rest'].includes(e.kind)||!Array.isArray(e.notes))fail('音符所属小节、手别或声部无效');rational(e.onset);rational(e.duration);if(val(e.onset)<0||val(e.duration)<=0||val(add(e.onset,e.duration))>val(m!.actualLength)+1e-9)fail('音符超出小节边界');if(!e.written||![1,2,4,8,16,32].includes(e.written.base)||![0,1].includes(e.written.dots))fail('不支持的音符时值');const group=e.written.tupletId?tupleMap.get(e.written.tupletId):undefined;if(e.written.tupletId&&!group)fail('三连音组缺失');if(!eq(e.duration,dur(e.written.base,e.written.dots,!!group)))fail('音符时值与记谱不一致');if((e.kind==='rest')!==(e.notes.length===0)||e.notes.length>LIMITS.maxChordNotes)fail('和弦/休止结构无效');const pitches=new Set<number>();e.notes.forEach(n=>{keys(n,['id','pitch','velocity'],'音高');checkId(n.id);noteCount++;const x=n.pitch;if(!x||!STEPS.includes(x.step)||![-1,0,1].includes(x.alter)||!Number.isInteger(x.octave)||midi(x)<21||midi(x)>108||pitches.has(midi(x)))fail('音域、变音或重复和弦音不合法');if(n.velocity!==undefined&&(!Number.isInteger(n.velocity)||n.velocity<1||n.velocity>127))fail('力度无效');pitches.add(midi(x));noteMap.set(n.id,{note:n,event:e});});});
  if(noteCount+s.events.filter(e=>e.kind==='rest').length>LIMITS.maxEvents)fail('音符数量超限');
  for(const m of s.measures)for(const h of ['right','left'] as Hand[]){let at=rat(0);for(const e of (grouped.get(m.id+':'+h)??[]).sort((a,b)=>val(a.onset)-val(b.onset))){if(!eq(at,e.onset))fail('声部存在重叠或空隙');at=add(at,e.duration);}if(!eq(at,m.actualLength))fail('小节未完整覆盖');}
  const nextEvent=new Map<string,string>();for(const h of ['right','left'] as Hand[]){const ordered=s.measures.flatMap(m=>grouped.get(m.id+':'+h)??[]);ordered.slice(1).forEach((e,i)=>nextEvent.set(ordered[i].id,e.id));}const endpoints=new Set<string>();s.ties.forEach(t=>{checkId(t.id);const a=noteMap.get(t.fromNoteId),b=noteMap.get(t.toNoteId);if(!a||!b||a.event.hand!==b.event.hand||pitchKey(a.note.pitch)!==pitchKey(b.note.pitch))fail('延音线端点无效');if(nextEvent.get(a!.event.id)!==b!.event.id)fail('延音线必须连接相邻音符');for(const key of [`out:${t.fromNoteId}`,`in:${t.toNoteId}`]){if(endpoints.has(key))fail('延音线重复');endpoints.add(key);}});
  s.slurs.forEach(t=>{checkId(t.id);const a=eventMap.get(t.fromEventId),b=eventMap.get(t.toEventId);if(!a||!b||a.id===b.id||a.hand!==b.hand||!a.notes.length||!b.notes.length)fail('乐句连线端点无效');});
  s.tuplets.forEach(t=>{checkId(t.id);if(t.actual!==3||t.normal!==2||!Array.isArray(t.eventIds)||!t.eventIds.length||new Set(t.eventIds).size!==t.eventIds.length||t.eventIds.some(e=>eventMap.get(e)?.written.tupletId!==t.id))fail('三连音组引用无效');});
  const tempoMeasures=new Set<string>();s.tempoMap.forEach(t=>{if(tempoMeasures.has(t.measureId))fail('同小节速度标记重复');tempoMeasures.add(t.measureId);rational(t.onset);if(!ms.has(t.measureId)||t.onset.n!==0||!Number.isFinite(t.quarterBpm)||t.quarterBpm<20||t.quarterBpm>300)fail('速度标记无效');});if(!s.tempoMap.some(t=>t.measureId===s.measures[0].id))fail('起始速度缺失');
  const regions:number[][]=[];s.repeatRegions.forEach(r=>{checkId(r.id);const a=s.measures.findIndex(m=>m.id===r.startMeasureId),b=s.measures.findIndex(m=>m.id===r.endMeasureId);if(a<0||b<a||r.count!==2||regions.some(([x,y])=>a<=y&&b>=x))fail('反复范围无效或重叠');regions.push([a,b]);});
}
export function importProject(text:string):Project {if(new TextEncoder().encode(text).length>LIMITS.maxBytes)throw Error('文件超过 10 MiB 上限');let nesting=0,inString=false,escape=false;for(const c of text){if(inString){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')inString=false;}else if(c==='"')inString=true;else if(c==='{'||c==='['){if(++nesting>LIMITS.maxDepth)throw Error('文件嵌套层数超限');}else if(c==='}'||c===']')nesting--;}
  let p:unknown;try{p=JSON.parse(text);}catch{throw Error('文件不是有效 JSON');}validate(p);const result=clone(p);result.sourceProjectId=p.projectId;result.projectId=id();result.revision=0;result.updatedAt=new Date().toISOString();return result;}

export function demoProject():Project {
  let p=createProject('晨光练习曲',8,[4,4],0,false,88);
  const melody=[['E4','G4','A4','G4'],['F4','E4','D4','C4'],['D4','F4','A4','G4'],['E4','D4','C4','G3'],['E4','G4','C5','B4'],['A4','G4','F4','E4'],['D4','F4','G4','B4'],['C5','G4','E4','C4']];
  const bass=[['C3','G3','E3','G3'],['A2','E3','C3','E3'],['F2','C3','A2','C3'],['G2','D3','B2','D3'],['C3','G3','E3','G3'],['F2','C3','A2','C3'],['G2','D3','B2','D3'],['C3','G3','C4','G3']];
  melody.forEach((bar,i)=>bar.forEach((name,j)=>{const pitch={step:name[0],alter:0,octave:Number(name[1])};p=setEvent(p,p.score.measures[i].id,'right',rat(j),[pitch],4);}));
  bass.forEach((bar,i)=>bar.forEach((name,j)=>{p=setEvent(p,p.score.measures[i].id,'left',rat(j),[{step:name[0],alter:0,octave:Number(name[1])}],4);}));
  p.score.events.find(e=>e.hand==='right'&&e.measureId===p.score.measures[0].id&&e.onset.n===0)!.notes.push({id:id(),pitch:{step:'C',alter:0,octave:4}});p.revision=0;validate(p);return p;
}
