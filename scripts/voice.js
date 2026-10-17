(function(root){
  'use strict';
  const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
  class AudioMixer{
    constructor(){this.config={voice:1,sfx:.65,music:.32,muted:false};this.voices=new Set();this.players=new Set();this.active=false;this.hidden=false;this.context=null;this.current=null;this.tick=null;this.primed=false;this.pool=new Map(['carefree.mp3','monkeys-spinning-monkeys.mp3'].map(file=>{const audio=new Audio('assets/music/'+file);audio.loop=true;audio.preload='metadata';audio.volume=0;return[file,{file,audio,retired:true,level:0,gain:null,source:null}];}));}
    configure(c){for(const key of ['voice','sfx','music'])if(c[key]!==undefined)this.config[key]=clamp(c[key]);this.config.muted=!!c.muted;for(const p of this.players)p.volume();this.refresh();}
    unlock(){
      this.active=true;this.hidden=false;
      try{this.context||=new(root.AudioContext||root.webkitAudioContext)();this.context.resume().catch(()=>{});
        const tone=this.context.createBufferSource();tone.buffer=this.context.createBuffer(1,1,22050);tone.connect(this.context.destination);tone.start();
      }catch(_){}
      // A GainNode controls music on iOS, where media-element volume may be read-only.
      if(this.context&&location.protocol!=='file:')for(const t of this.pool.values())if(!t.source){try{t.source=this.context.createMediaElementSource(t.audio);t.gain=this.context.createGain();t.gain.gain.value=t.level;t.source.connect(t.gain);t.gain.connect(this.context.destination);t.audio.volume=1;}catch(_){}}
      // Prime both reusable music elements directly inside the user's gesture.
      if(!this.primed){this.primed=true;for(const t of this.pool.values()){this.musicLevel(t,0);t.audio.play().then(()=>{if(t!==this.current||this.hidden)t.audio.pause();}).catch(()=>{});}}
      this.start();
    }
    musicLevel(t,value){t.level=clamp(value);if(t.gain){t.gain.gain.value=t.level;t.audio.volume=1;t.audio.muted=false;}else{t.audio.volume=t.level;t.audio.muted=t.level===0;}}
    theme(name){const file=['explore','mystery'].includes(name)?'monkeys-spinning-monkeys.mp3':'carefree.mp3';this.level=name==='mystery'?.6:1;const next=this.pool.get(file);if(next===this.current){this.refresh();return;}if(this.current)this.current.retired=true;this.current=next;next.retired=false;this.start();}
    start(){if(!this.active||this.hidden||!this.current)return;this.current.audio.play().catch(()=>{});this.refresh();}
    speaking(p,yes){yes?this.voices.add(p):this.voices.delete(p);this.refresh();}
    refresh(){if(this.tick)return;this.tick=setInterval(()=>{let moving=false;for(const t of this.pool.values()){const target=t.retired||!this.active||this.hidden||this.config.muted?0:this.config.music*(this.level||1)*(this.voices.size?.22:1),delta=target-t.level;this.musicLevel(t,Math.abs(delta)<.003?target:t.level+delta*.25);if(Math.abs(delta)>.003)moving=true;if(t.retired&&t.level<.003)t.audio.pause();}if(!moving){clearInterval(this.tick);this.tick=null;}},40);}
    suspend(){this.hidden=true;this.pool.forEach(t=>t.audio.pause());this.players.forEach(p=>p.pause());this.refresh();}
    resume(){if(this.active&&!document.hidden){this.hidden=false;this.start();}}
  }
  const mixer=new AudioMixer(),buffers=new Map();
  async function bufferFor(url){
    if(buffers.has(url)){const p=buffers.get(url);buffers.delete(url);buffers.set(url,p);return p;}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
    const promise=fetch(url,{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Audio unavailable');return r.arrayBuffer();}).then(data=>mixer.context.decodeAudioData(data)).finally(()=>clearTimeout(timer));
    buffers.set(url,promise);while(buffers.size>12)buffers.delete(buffers.keys().next().value);
    try{return await promise;}catch(e){buffers.delete(url);throw e;}
  }
  class RunnerVoice{
    constructor(base='assets/audio/',onStatus=()=>{}){this.base=base;this.onStatus=onStatus;this.audio=new Audio();this.token=0;this.pending=null;this.last=null;this.muted=false;this.userPaused=false;this.offset=0;this.source=null;this.gain=null;this.buffer=null;this.watchdog=null;mixer.players.add(this);}
    volume(){const v=this.muted||mixer.config.muted?0:mixer.config.voice;this.audio.volume=v;if(this.gain)this.gain.gain.value=v;}
    disconnect(){if(this.source){this.source.onended=null;try{this.source.stop();}catch(_){}this.source.disconnect();this.source=null;}if(this.gain){this.gain.disconnect();this.gain=null;}}
    stop(){this.token++;this.disconnect();this.audio.pause();this.audio.onended=null;this.audio.onerror=null;clearTimeout(this.watchdog);this.watchdog=null;if(this.pending){this.pending(false);this.pending=null;}this.buffer=null;this.offset=0;mixer.speaking(this,false);this.onStatus('stopped');}
    complete(ok,token){if(token!==this.token||!this.pending)return;this.disconnect();this.audio.pause();this.audio.onended=null;this.audio.onerror=null;clearTimeout(this.watchdog);const done=this.pending;this.pending=null;mixer.speaking(this,false);this.onStatus(ok?'ended':'error');done(ok);}
    play(id){this.stop();this.last=id;this.userPaused=false;if(this.muted||mixer.config.muted||mixer.config.voice===0)return Promise.resolve(true);const token=this.token,url=this.base+encodeURIComponent(id)+'.wav';
      return new Promise(resolve=>{this.pending=resolve;
        if(mixer.context&&location.protocol!=='file:'){
          bufferFor(url).then(buffer=>{if(token!==this.token)return;this.buffer=buffer;if(!this.userPaused)this.startBuffer(token);}).catch(()=>this.complete(false,token));
        }else{this.audio.src=url;this.volume();this.audio.onended=()=>this.complete(true,token);this.audio.onerror=()=>this.complete(false,token);this.onStatus('playing');mixer.speaking(this,true);this.audio.play().catch(()=>this.complete(false,token));this.watchdog=setTimeout(()=>{if(!this.userPaused)this.complete(false,token);},18000);}
      });
    }
    startBuffer(token){
      if(token!==this.token||!this.buffer||!this.pending)return;
      const c=mixer.context;if(c.state!=='running'){this.complete(false,token);return;}
      this.source=c.createBufferSource();this.gain=c.createGain();this.source.buffer=this.buffer;this.volume();this.source.connect(this.gain);this.gain.connect(c.destination);this.started=c.currentTime;this.source.onended=()=>this.complete(true,token);mixer.speaking(this,true);this.onStatus('playing');
      try{this.source.start(0,Math.min(this.offset,this.buffer.duration));}catch(_){this.complete(false,token);}
    }
    pause(){if(this.userPaused)return;this.userPaused=true;if(this.source){this.offset+=Math.max(0,mixer.context.currentTime-this.started);this.disconnect();}this.audio.pause();clearTimeout(this.watchdog);mixer.speaking(this,false);if(this.pending)this.onStatus('paused');}
    resume(){if(!this.pending||this.muted||mixer.config.muted)return;this.userPaused=false;if(this.buffer)this.startBuffer(this.token);else if(this.audio.src){const token=this.token;this.onStatus('playing');mixer.speaking(this,true);this.audio.play().catch(()=>this.complete(false,token));}}
    setMuted(v){this.muted=!!v;this.volume();if(v)this.stop();}
    destroy(){this.stop();this.audio.removeAttribute('src');mixer.players.delete(this);}
  }
  class RunnerSound{
    constructor(){this.context=null;this.muted=false;}
    unlock(){try{mixer.unlock();this.context=mixer.context;this.context.resume().catch(()=>{});}catch(_){}}
    play(kind){if(this.muted||mixer.config.muted||mixer.config.sfx===0)return;this.unlock();if(!this.context)return;const c=this.context,volume=mixer.config.sfx;
      const patterns={correct:[784,1047,1319],wrong:[392,294],flip:[840],stamp:[659,988],send:[523,659,784,1047],finish:[523,659,784,1047,1319]};const tones=patterns[kind]||patterns.flip;
      tones.forEach((hz,i)=>{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+i*(kind==='wrong'?.11:.075),duration=kind==='finish'?.35:.22;o.type=kind==='wrong'?'triangle':'sine';o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(hz*(kind==='wrong'?.93:1),t+duration);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime((kind==='wrong'?.24:.14)*volume,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+duration+.03);});
      // A soft paper/wood transient gives each action a tactile attack.
      const size=Math.floor(c.sampleRate*.055),buffer=c.createBuffer(1,size,c.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<size;i++)data[i]=(Math.random()*2-1)*(1-i/size)**3;const src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();src.buffer=buffer;filter.type='lowpass';filter.frequency.value=kind==='wrong'?650:1800;gain.gain.value=.08*volume;src.connect(filter);filter.connect(gain);gain.connect(c.destination);src.start();
    }
    destroy(){}
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)mixer.suspend();});
  root.RunnerAudio={RunnerVoice,RunnerSound,mixer};
})(window);
