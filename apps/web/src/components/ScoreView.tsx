import {memo,useEffect,useRef,useCallback,useState} from 'react';
import {Renderer,Stave,StaveNote,TickContext,Accidental,Dot,Beam,StaveTie,StaveConnector,Tuplet,Curve,Barline,Metrics,ModifierContext} from 'vexflow/bravura';
import {type Score,type Measure,type Hand,type ScoreEvent,type Rational,line,val,jianpu,VEX_KEYS,keyAlter,rat} from '../core/score';
export type Cursor={measureId:string;hand:Hand;onset:Rational;eventId?:string};
type Props={score:Score;view:'staff'|'jianpu';cursor:Cursor;selection:string[];activeIds:string[];onSelect:(cursor:Cursor,extend:boolean)=>void;zoom:number};
const groupedCache=new WeakMap<Score,Map<string,ScoreEvent[]>>();
function eventsFor(score:Score,measureId:string){let map=groupedCache.get(score);if(!map){map=new Map();for(const e of score.events){const list=map.get(e.measureId)??[];list.push(e);map.set(e.measureId,list);}groupedCache.set(score,map);}return map.get(measureId)??[];}
const localLine=(score:Score,measureId:string,hand:Hand)=>eventsFor(score,measureId).filter(e=>e.hand===hand).sort((a,b)=>val(a.onset)-val(b.onset));
const startX=126;
function positions(score:Score,m:Measure){const all=eventsFor(score,m.id);const times=[...new Set([0,...all.map(e=>val(e.onset))])].sort((a,b)=>a-b);const xs=new Map<number,number>();let x=startX+Math.abs(m.key)*10;for(const t of times){xs.set(t,x);const group=all.filter(e=>val(e.onset)===t);x+=Math.max(48,...group.map(e=>30+e.notes.length*7+(e.notes.some(n=>n.pitch.alter)?12:0)));}return {xs,width:Math.max(330,x+28)};}
function geometry(score:Score,m:Measure,view:Props['view']){
  const events=eventsFor(score,m.id);
  const count=(h:Hand)=>Math.max(1,...events.filter(e=>e.hand===h).map(e=>e.notes.length));
  if(view==='jianpu'){const r=count('right'),l=count('left');const rightCenter=Math.max(98,(r-1)*16+54);const leftCenter=Math.max(238,rightCenter+(r-1)*16+(l-1)*16+78);return {rightY:37,leftY:190,rightCenter,leftCenter,height:Math.max(330,leftCenter+(l-1)*16+60)};}
  const extent=(h:Hand,top:number,bottom:number)=>{const pitches=events.filter(e=>e.hand===h).flatMap(e=>e.notes.map(n=>n.pitch.octave*7+'CDEFGAB'.indexOf(n.pitch.step)));return {up:Math.max(0,(Math.max(top,...pitches)-top)*5-22),down:Math.max(0,(bottom-Math.min(bottom,...pitches))*5-15)};};
  const r=extent('right',38,30),l=extent('left',26,18);const rightY=37+r.up;const leftY=Math.max(190,rightY+125+r.down+l.up);return {rightY,leftY,rightCenter:98,leftCenter:238,height:Math.max(330,leftY+115+l.down)};
}
function signature(score:Score,measureId:string){return JSON.stringify([score.measures.find(m=>m.id===measureId),eventsFor(score,measureId),score.ties,score.slurs,score.tuplets,score.repeatRegions]);}
const NoteGlyph=({e,score,m,x,y}:{e:ScoreEvent;score:Score;m:Measure;x:number;y:number})=>{
  const notes=e.notes.length?[...e.notes].sort((a,b)=>(b.pitch.octave*7+'CDEFGAB'.indexOf(b.pitch.step))-(a.pitch.octave*7+'CDEFGAB'.indexOf(a.pitch.step))):[null];
  const lines=Math.max(0,Math.log2(e.written.base)-2);const top=y-(notes.length-1)*32/2;
  return <g>
    {notes.map((n,i)=>{const p=n?jianpu(n.pitch,m.key):{digit:0,octave:0,accidental:0};const at=top+i*32;return <g key={n?.id??'rest'}>
      <text x={x} y={at} textAnchor="middle" className="jianpu-digit">{p.digit}</text>
      {p.accidental!==0&&<text x={x-14} y={at-2} fontSize="13">{p.accidental>0?'♯':'♭'}</text>}
      {Array.from({length:Math.abs(p.octave)},(_,j)=><circle key={j} cx={x} cy={p.octave>0?at-27-j*6:at+9+j*6} r="1.5"/>)}
      {!!e.written.dots&&<circle cx={x+13} cy={at-8} r="1.8"/>}
    </g>;})}
    {Array.from({length:lines},(_,i)=><line key={i} x1={x-10} x2={x+10} y1={top+(notes.length-1)*32+23+i*5} y2={top+(notes.length-1)*32+23+i*5} stroke="currentColor" strokeWidth="1.4"/>)}
    {e.written.base<=2&&Array.from({length:e.written.base===1?3:1},(_,i)=><text key={i} x={x+25+i*15} y={y} fontSize="20">−</text>)}
    {e.written.tupletId&&<text x={x} y={top-39} textAnchor="middle" fontSize="11" fill="#65706b">3</text>}
  </g>;
};
const MeasureView=memo(function MeasureView({score,m,index,view,selected,onSelect}:{score:Score;m:Measure;index:number;view:Props['view'];selected:string[];onSelect:Props['onSelect']}){
  const ref=useRef<HTMLDivElement>(null);const viewportRef=useRef<HTMLDivElement>(null);const [inView,setInView]=useState(index<4);const visible=inView||selected.length>0;const {xs,width}=positions(score,m);const layout=geometry(score,m,view);const right=localLine(score,m.id,'right'),left=localLine(score,m.id,'left');
  const repeatStart=score.repeatRegions.some(r=>r.startMeasureId===m.id),repeatEnd=score.repeatRegions.some(r=>r.endMeasureId===m.id);
  useEffect(()=>{if(!viewportRef.current)return;const observer=new IntersectionObserver(entries=>setInView(entries[0].isIntersecting),{root:viewportRef.current.closest('.score-scroll'),rootMargin:'350px'});observer.observe(viewportRef.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{if(!visible||view!=='staff'||!ref.current)return;ref.current.replaceChildren();
    try{const renderer=new Renderer(ref.current,Renderer.Backends.SVG);renderer.resize(width,layout.height);const ctx=renderer.getContext();ctx.setFillStyle('#24352e');ctx.setStrokeStyle('#6a756f');
      const staves=(['right','left'] as Hand[]).map((h,i)=>{const stave=new Stave(32,i===0?layout.rightY:layout.leftY,width-48);stave.addClef(h==='right'?'treble':'bass');if(m.key)stave.addKeySignature(VEX_KEYS[m.key+7]);stave.addTimeSignature(m.meter.join('/'));if(repeatStart)stave.setBegBarType(Barline.type.REPEAT_BEGIN);if(repeatEnd)stave.setEndBarType(Barline.type.REPEAT_END);stave.setContext(ctx).draw();return stave;});
      new StaveConnector(staves[0],staves[1]).setType(StaveConnector.type.BRACE).setContext(ctx).draw();
      const notes=new Map<string,StaveNote>();
      for(const [hi,h] of (['right','left'] as Hand[]).entries()){
        const accidentalState=new Map<string,number>();const list=localLine(score,m.id,h);
        for(const e of list){const ordered=e.notes.length?[...e.notes].sort((a,b)=>a.pitch.octave*7+'CDEFGAB'.indexOf(a.pitch.step)-b.pitch.octave*7-'CDEFGAB'.indexOf(b.pitch.step)):[];
          const note=new StaveNote({clef:h==='right'?'treble':'bass',keys:ordered.length?ordered.map(n=>`${n.pitch.step.toLowerCase()}/${n.pitch.octave}`):[h==='right'?'b/4':'d/3'],duration:({1:'w',2:'h',4:'q',8:'8',16:'16',32:'32'} as Record<number,string>)[e.written.base]+(e.kind==='rest'?'r':''),stemDirection:h==='right'?1:-1});
          ordered.forEach((n,i)=>{const k=n.pitch.step+n.pitch.octave;const previous=accidentalState.get(k)??keyAlter(n.pitch.step,m.key);if(previous!==n.pitch.alter)note.addModifier(new Accidental(n.pitch.alter===1?'#':n.pitch.alter===-1?'b':'n'),i);accidentalState.set(k,n.pitch.alter);});
          if(e.written.dots)Dot.buildAndAttach([note],{all:true});note.setStave(staves[hi]);note.addToModifierContext(new ModifierContext());const tick=new TickContext().addTickable(note).preFormat().setX(xs.get(val(e.onset))!-staves[hi].getNoteStartX()-Metrics.get('Stave.padding',0));note.setContext(ctx);if(selected.includes(e.id))note.setStyle({fillStyle:'#176b50',strokeStyle:'#176b50'});notes.set(e.id,note);
        }
        const beams:Beam[]=[];let group:StaveNote[]=[];let lastBeat=-1;const flush=()=>{if(group.length>=2)beams.push(new Beam(group));group=[];};
        for(const e of list){const beat=Math.floor(val(e.onset)/(m.meter[1]===8?1.5:1));if(beat!==lastBeat)flush();if(e.kind==='chord'&&e.written.base>=8)group.push(notes.get(e.id)!);else flush();lastBeat=beat;}flush();for(const e of list)notes.get(e.id)!.draw();beams.forEach(beam=>beam.setContext(ctx).draw());
      }
      for(const tie of score.ties){const a=score.events.find(e=>e.notes.some(n=>n.id===tie.fromNoteId)),b=score.events.find(e=>e.notes.some(n=>n.id===tie.toNoteId));if(!a||!b)continue;const na=notes.get(a.id),nb=notes.get(b.id);if(!na&&!nb)continue;const ai=[...a.notes].sort((x,y)=>x.pitch.octave*7+'CDEFGAB'.indexOf(x.pitch.step)-y.pitch.octave*7-'CDEFGAB'.indexOf(y.pitch.step)).findIndex(n=>n.id===tie.fromNoteId);const bi=[...b.notes].sort((x,y)=>x.pitch.octave*7+'CDEFGAB'.indexOf(x.pitch.step)-y.pitch.octave*7-'CDEFGAB'.indexOf(y.pitch.step)).findIndex(n=>n.id===tie.toNoteId);new StaveTie({firstNote:na,lastNote:nb,firstIndexes:[ai],lastIndexes:[bi]}).setContext(ctx).draw();}
      for(const slur of score.slurs){const a=notes.get(slur.fromEventId),b=notes.get(slur.toEventId);if(a||b)new Curve(a,b,{cps:[{x:0,y:15},{x:0,y:15}]}).setContext(ctx).draw();}
      for(const group of score.tuplets){const ns=group.eventIds.map(e=>notes.get(e)).filter(Boolean) as StaveNote[];if(ns.length>1)new Tuplet(ns,{numNotes:3,notesOccupied:2}).setContext(ctx).draw();}
    }catch(error){if(ref.current)ref.current.textContent=`排版失败：${error instanceof Error?error.message:'请调整小节'}`;}
  },[score,m,view,width,selected.join(','),visible]);
  const all=[...right,...left];return <div ref={viewportRef} className="measure" data-measure={index+1} style={{width,height:layout.height+20}}>{visible&&<>
    <div className="measure-label"><span>{String(index+1).padStart(2,'0')}</span>{val(m.actualLength)<m.meter[0]*4/m.meter[1]&&<small>弱起</small>}{repeatEnd&&<small>反复 ×2</small>}</div>
    {view==='staff'?<div ref={ref} className="vex-score"/>:<svg width={width} height={layout.height} className="jianpu-score" aria-label={`第 ${index+1} 小节双手简谱`}>
      <text x="20" y="30" fontSize="12" fill="#758079">{m.meter.join('/')} {repeatStart?'𝄆':''}</text>
      <line x1="22" x2="22" y1="53" y2={layout.height-50} stroke="#87948c"/><line x1={width-15} x2={width-15} y1="53" y2={layout.height-50} stroke="#87948c"/>
      {(['right','left'] as Hand[]).map((h,i)=><g key={h}><text x="29" y={i?layout.leftCenter-6:layout.rightCenter-6} fontSize="11" fill="#849089">{i?'左':'右'}</text>{localLine(score,m.id,h).map(e=><NoteGlyph key={e.id} e={e} score={score} m={m} x={xs.get(val(e.onset))!} y={i?layout.leftCenter:layout.rightCenter}/>)}</g>)}
      {[...score.ties.map(t=>({from:score.events.find(e=>e.notes.some(n=>n.id===t.fromNoteId)),to:score.events.find(e=>e.notes.some(n=>n.id===t.toNoteId)),slur:false})),...score.slurs.map(t=>({from:score.events.find(e=>e.id===t.fromEventId),to:score.events.find(e=>e.id===t.toEventId),slur:true}))].filter(t=>t.from?.measureId===m.id||t.to?.measureId===m.id).map((t,i)=>{const from=t.from!,to=t.to!;const x1=from.measureId===m.id?xs.get(val(from.onset))!:32,x2=to.measureId===m.id?xs.get(val(to.onset))!:width-20;const y=(from.hand==='right'?layout.rightCenter:layout.leftCenter)+Math.max(1,from.notes.length)*16+20;return <path key={i} d={`M ${x1} ${y} Q ${(x1+x2)/2} ${y+(t.slur?28:16)} ${x2} ${y}`} stroke="#65786b" fill="none"/>;})}
      {repeatEnd&&<text x={width-29} y="174" fontSize="22">𝄇</text>}
    </svg>}
    <svg className="hit-layer" width={width} height={layout.height} aria-label={`第 ${index+1} 小节编辑区`}>
      {all.map(e=>{const x=xs.get(val(e.onset))!;const boundary=view==='staff'?layout.leftY-5:(layout.leftCenter+layout.rightCenter)/2;const y=e.hand==='right'?25:boundary;const hitHeight=e.hand==='right'?boundary-30:layout.height-boundary-12;return <g key={e.id}>
        <rect role="button" tabIndex={0} aria-label={`第${index+1}小节${e.hand==='right'?'右手':'左手'}第${Number((val(e.onset)+1).toFixed(2))}拍${e.kind==='rest'?'休止':'音符'}`} data-event={e.id} x={x-16} y={y} width={Math.min(42,width-x-5)} height={hitHeight} rx="5" className={selected.includes(e.id)?'hit selected':'hit'} onClick={ev=>onSelect({measureId:m.id,hand:e.hand,onset:e.onset,eventId:e.id},ev.shiftKey)} onKeyDown={ev=>{if(ev.key==='Enter')onSelect({measureId:m.id,hand:e.hand,onset:e.onset,eventId:e.id},ev.shiftKey);}}/>
      </g>;})}
    </svg>
  </>}</div>;
},(a,b)=>a.view===b.view&&a.selected.join(',')===b.selected.join(',')&&signature(a.score,a.m.id)===signature(b.score,b.m.id));
export default function ScoreView(props:Props){const {score,view,cursor,selection,onSelect}=props;const handler=useRef(onSelect);handler.current=onSelect;const stableSelect=useCallback((c:Cursor,extend:boolean)=>handler.current(c,extend),[]);return <div className="sheet-systems" style={{zoom:props.zoom}}>{score.measures.map((m,index)=>{const {xs,width}=positions(score,m);const active=props.activeIds.find(id=>score.events.some(e=>e.id===id&&e.measureId===m.id));const e=score.events.find(e=>e.id===active);const selected=selection.filter(id=>score.events.some(e=>e.id===id&&e.measureId===m.id));const cursorHere=cursor.measureId===m.id;return <div className={`measure-shell ${cursorHere?'current-measure':''}`} key={m.id} style={{width}}>
    <MeasureView score={score} m={m} index={index} view={view} selected={selected} onSelect={stableSelect}/>
    {e&&<div className="playhead" style={{left:xs.get(val(e.onset))!+8,height:geometry(score,m,view).height-55}}/>}
    {cursorHere&&<div className="cursor-caption">{cursor.hand==='right'?'右手':'左手'} · 第 {Number((val(cursor.onset)+1).toFixed(2))} 拍</div>}
  </div>;})}</div>;}
