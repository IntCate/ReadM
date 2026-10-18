import type {Plan} from '../core/playback';
import type {Hand} from '../core/score';
type State={time:number;playing:boolean};
// Fully local additive piano: generated harmonics, no remote samples or resource licenses.
export class PianoAudio {
  private ctx:AudioContext|null=null;private master:GainNode|null=null;private active=new Set<OscillatorNode>();private timer:ReturnType<typeof setInterval>|undefined;private frame=0;private origin=0;private cursor=0;private noteIndex=0;private beatIndex=0;private plan:Plan|null=null;private loop=false;private callback:((s:State)=>void)|null=null;
  muted:Record<Hand,boolean>={right:false,left:false};metronome=false;playing=false;
  async ready(){if(!this.ctx){this.ctx=new AudioContext({latencyHint:'interactive'});this.master=this.ctx.createGain();this.master.gain.value=.65;const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-18;limiter.knee.value=24;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.25;this.master.connect(limiter);limiter.connect(this.ctx.destination);}if(this.ctx.state==='suspended')await this.ctx.resume();if(this.ctx.state!=='running')throw Error('浏览器未能启动音频，请再次点击播放');}
  private tone(key:number,velocity:number,start:number,duration:number,click=false){const c=this.ctx!;const frequency=440*Math.pow(2,(key-69)/12);const gain=c.createGain();const at=Math.max(c.currentTime+.001,start);const length=Math.max(.04,duration);gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime((click?.04:.095)*(velocity/127),at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+length+.18);gain.connect(this.master!);
    const harmonics=click?[1]:[1,2,3,4,6];harmonics.forEach((partial,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=frequency*partial;g.gain.value=[1,.4,.18,.09,.025][i]??1;o.connect(g);g.connect(gain);o.start(at);o.stop(at+length+.2);this.active.add(o);o.onended=()=>{this.active.delete(o);o.disconnect();g.disconnect();};});setTimeout(()=>gain.disconnect(),Math.max(0,(at-c.currentTime+length+.3)*1000));}
  async preview(key:number){await this.ready();this.tone(key,90,this.ctx!.currentTime,.3);}
  async play(plan:Plan,offset:number,loop:boolean,onState:(state:State)=>void){this.stop(false);await this.ready();this.plan=plan;this.loop=loop;this.callback=onState;this.cursor=Math.min(Math.max(offset,0),plan.duration);this.origin=this.ctx!.currentTime-this.cursor+.06;this.noteIndex=plan.notes.findIndex(n=>n.start+n.duration>this.cursor);if(this.noteIndex<0)this.noteIndex=plan.notes.length;
    // Sort by absolute time; compiling traverses each hand separately.
    this.plan={...plan,notes:[...plan.notes].sort((a,b)=>a.start-b.start)};this.noteIndex=this.plan.notes.findIndex(n=>n.start+n.duration>this.cursor);if(this.noteIndex<0)this.noteIndex=this.plan.notes.length;this.beatIndex=0;this.playing=true;
    const beats=plan.occurrences.flatMap(o=>Array.from({length:Math.ceil(o.duration*o.quarterBpm/60/o.beatLengthQuarter)},(_,i)=>({at:o.start+i*60/o.quarterBpm*o.beatLengthQuarter,strong:i===0})));
    this.beatIndex=beats.findIndex(b=>b.at>=this.cursor);if(this.beatIndex<0)this.beatIndex=beats.length;
    const tick=()=>{if(!this.playing||!this.ctx||!this.plan)return;const now=this.ctx.currentTime-this.origin;const horizon=now+.1;
      while(this.noteIndex<this.plan.notes.length&&this.plan.notes[this.noteIndex].start<horizon){const n=this.plan.notes[this.noteIndex++];if(n.start+n.duration<=this.cursor||this.muted[n.hand])continue;const start=Math.max(n.start,this.cursor);this.tone(n.midi,n.velocity,this.origin+start,n.duration-(start-n.start));}
      while(this.beatIndex<beats.length&&beats[this.beatIndex].at<horizon){const beat=beats[this.beatIndex++];if(this.metronome)this.tone(beat.strong?100:93,70,this.origin+beat.at,.025,true);}
    };tick();this.timer=setInterval(tick,25);
    const draw=()=>{if(!this.playing||!this.ctx)return;const time=Math.max(0,this.ctx.currentTime-this.origin);if(time>=plan.duration){if(this.loop){void this.play(plan,0,true,onState);return;}this.stop(false);onState({time:0,playing:false});return;}this.callback?.({time,playing:true});this.frame=requestAnimationFrame(draw);};this.frame=requestAnimationFrame(draw);
  }
  pause(){const time=this.ctx?Math.max(0,this.ctx.currentTime-this.origin):0;this.stop(false);this.callback?.({time,playing:false});return time;}
  stop(notify=true){this.playing=false;if(this.timer)clearInterval(this.timer);cancelAnimationFrame(this.frame);this.active.forEach(o=>{try{o.stop();}catch{/* already stopped */}});this.active.clear();if(notify)this.callback?.({time:0,playing:false});}
  dispose(){this.stop();void this.ctx?.close();this.ctx=null;}
}
