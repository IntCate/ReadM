import {type Project,type Hand,type ScoreEvent,midi,val,line} from './score';
export type PlayNote={midi:number;velocity:number;start:number;duration:number;hand:Hand;sourceId:string};
export type Occurrence={id:string;measureId:string;index:number;start:number;duration:number;quarterBpm:number;beatLengthQuarter:number;events:{id:string;start:number;duration:number}[]};
export type Plan={revision:number;notes:PlayNote[];occurrences:Occurrence[];duration:number};
export function compile(p:Project,range?:[number,number],multiplier=1):Plan{
  const s=p.score;let order:number[]=[];
  if(range)order=Array.from({length:range[1]-range[0]+1},(_,i)=>range[0]+i);
  else {for(let i=0;i<s.measures.length;i++){const region=s.repeatRegions.find(r=>r.startMeasureId===s.measures[i].id);if(region){const end=s.measures.findIndex(m=>m.id===region.endMeasureId);for(let n=0;n<region.count;n++)for(let j=i;j<=end;j++)order.push(j);i=end;}else order.push(i);}}
  const tempos=s.measures.map((_,i)=>{let bpm=88;for(let j=0;j<=i;j++){const point=s.tempoMap.find(t=>t.measureId===s.measures[j].id);if(point)bpm=point.quarterBpm;}return bpm*multiplier;});
  const plan:Plan={revision:p.revision,notes:[],occurrences:[],duration:0};const outgoing=new Map(s.ties.map(t=>[t.fromNoteId,t.toNoteId]));
  const waiting=new Map<string,{note:PlayNote;end:number;previousEvent:ScoreEvent}>();
  for(let oi=0;oi<order.length;oi++){const i=order[oi],m=s.measures[i],bpm=tempos[i],scale=60/bpm;const start=plan.duration;
    if(oi>0&&order[oi-1]+1!==i)waiting.clear();
    const events=(['right','left'] as Hand[]).flatMap(h=>line(s,m.id,h));const occurrence:Occurrence={id:`${oi}:${m.id}`,measureId:m.id,index:i,start,duration:val(m.actualLength)*scale,quarterBpm:bpm,beatLengthQuarter:m.meter[1]===8?1.5:1,events:[]};
    for(const e of events){const t=start+val(e.onset)*scale,d=val(e.duration)*scale;occurrence.events.push({id:e.id,start:t,duration:d});for(const n of e.notes){const sustained=waiting.get(n.id);let sound:PlayNote;
        if(sustained&&Math.abs(sustained.end-t)<1e-6){sound=sustained.note;sound.duration+=d;waiting.delete(n.id);}else{sound={midi:midi(n.pitch),velocity:n.velocity??84,start:t,duration:d,hand:e.hand,sourceId:e.id};plan.notes.push(sound);}
        const next=outgoing.get(n.id);if(next)waiting.set(next,{note:sound,end:t+d,previousEvent:e});
      }}
    plan.occurrences.push(occurrence);plan.duration+=occurrence.duration;
  }return plan;
}
