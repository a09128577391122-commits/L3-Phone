(function(root){
  'use strict';
  const doc=document.documentElement;
  let scheduled=false,last='',portrait=null;
  function update(){
    scheduled=false;
    const v=root.visualViewport;
    // Pinch zoom belongs to the browser; do not reflow or cancel the user's zoom.
    if(v&&Math.abs(v.scale-1)>.025)return;
    const w=Math.max(1,Math.round(v?.width||root.innerWidth));
    const h=Math.max(1,Math.round(v?.height||root.innerHeight));
    const top=Math.max(0,Math.round(v?.offsetTop||0)),left=Math.max(0,Math.round(v?.offsetLeft||0));
    const geometry=[w,h,top,left].join(':');
    if(geometry!==last){last=geometry;doc.style.setProperty('--view-w',w+'px');doc.style.setProperty('--view-h',h+'px');doc.style.setProperty('--view-top',top+'px');doc.style.setProperty('--view-left',left+'px');}
    const next=h>w;
    doc.classList.toggle('portrait',next);
    if(portrait!==next){portrait=next;root.dispatchEvent(new CustomEvent('mobileorientation',{detail:{portrait:next}}));}
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
  root.addEventListener('resize',schedule,{passive:true});
  root.addEventListener('orientationchange',schedule,{passive:true});
  root.visualViewport?.addEventListener('resize',schedule,{passive:true});
  root.visualViewport?.addEventListener('scroll',schedule,{passive:true});
  root.addEventListener('pageshow',schedule,{passive:true});
  root.MobileViewport={canFullscreen:()=>!!document.fullscreenEnabled&&typeof document.documentElement.requestFullscreen==='function'};
  update();
})(window);
