(function () {
 const mapKey=window.PhysicsMapKey;
 function mount(canvas,tooltip,atlas,onSelect,onEdge=()=>{}) {
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
  let width=960,height=620,selected=atlas.nodes.some(n=>n.id==='force')?'force':atlas.nodes[0]?.id,offset=-1,zoom=1,panX=0,panY=0,drag=null,frame=null,destroyed=false;
  let view,positions=new Map(),labels=[];const listeners=[];
  function listen(target,name,fn,options){target.addEventListener(name,fn,options);listeners.push(()=>target.removeEventListener(name,fn,options));}
  const human=s=>s.replaceAll('_',' ');
  function layout(){
   view=window.PhysicsGraphView.neighborhood(atlas,selected,offset,width<600?4:5);positions=new Map();
   const mechanics=offset<0&&['force','net_force','acceleration'].includes(selected)&&view.nodes.some(n=>n.id==='net_force');
   const mobile=width<600;
   if(mechanics){
    const core=['force','net_force','acceleration'];core.forEach((id,i)=>positions.set(id,mobile?{x:width*.48,y:95+i*170}:{x:100+i*(width-200)/2,y:height*.36}));
    const rest=view.nodes.filter(n=>!core.includes(n.id));rest.forEach((n,i)=>positions.set(n.id,mobile?{x:width*.48,y:605+i*155}:{x:110+i*(width-220)/Math.max(1,rest.length-1),y:height*.77}));
   }else{
    positions.set(selected,{x:mobile?85:width*.5,y:mobile?110:height*.45});
    const peers=view.nodes.filter(n=>n.id!==selected);peers.forEach((n,i)=>{const angle=-Math.PI/2+i*2*Math.PI/peers.length;positions.set(n.id,mobile?{x:width-95,y:260+i*180}:{x:width*.5+Math.cos(angle)*(width*.36),y:height*.48+Math.sin(angle)*(height*.34)});});
   }
   const maxY=Math.max(...[...positions.values()].map(p=>p.y));canvas.style.minHeight=mobile?Math.max(740,maxY+90)+'px':'620px';
  }
  const screen=id=>{const p=positions.get(id);return {x:width/2+(p.x-width/2)*zoom+panX,y:height/2+(p.y-height/2)*zoom+panY};};
  const box=n=>{const p=screen(n.id);return {...p,w:Math.min(width<600?170:190,Math.max(95,n.label.length*7+24)),h:44};};
  function endpoint(a,b){const dx=b.x-a.x,dy=b.y-a.y;const t=Math.min(Math.abs((a.w/2+5)/(dx||.0001)),Math.abs((a.h/2+5)/(dy||.0001)));return {x:a.x+dx*t,y:a.y+dy*t};}
  function draw(){
   frame=null;if(destroyed||document.hidden)return;
   const ratio=Math.min(window.devicePixelRatio||1,2);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);labels=[];
   const byId=new Map(view.nodes.map(n=>[n.id,n]));
   for(const e of view.edges){
    const a=box(byId.get(e.source)),b=box(byId.get(e.target)),from=endpoint(a,b),to=endpoint(b,a);const style=mapKey.classify(e);ctx.globalAlpha=1;ctx.strokeStyle=style.color;ctx.fillStyle=style.color;ctx.lineWidth=e.relation==='causes'?3:1.7;ctx.setLineDash(style.dash);
    ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();ctx.setLineDash([]);
    const angle=Math.atan2(to.y-from.y,to.x-from.x);ctx.beginPath();ctx.moveTo(to.x,to.y);ctx.lineTo(to.x-11*Math.cos(angle-.4),to.y-11*Math.sin(angle-.4));ctx.lineTo(to.x-11*Math.cos(angle+.4),to.y-11*Math.sin(angle+.4));if(e.kind==='causation')ctx.fill();else ctx.stroke();
    const text=human(e.relation),words=text.split(' '),lines=[];let line='';for(const word of words){if((line+' '+word).length>24){lines.push(line);line=word}else line+=(line?' ':'')+word;}if(line)lines.push(line);
    const x=(from.x+to.x)/2,y=(from.y+to.y)/2;ctx.font='600 12px system-ui';ctx.textAlign='center';const w=Math.min(width-24,Math.max(...lines.map(l=>l.length))*7+16);ctx.fillStyle='#10252d';ctx.fillRect(x-w/2,y-12,w,lines.length*16+6);ctx.fillStyle=style.color;lines.forEach((l,i)=>ctx.fillText(l,x,y+i*16));labels.push({x,y,w,h:lines.length*16+8,edge:e});
   }
   for(const n of view.nodes){const b=box(n);ctx.fillStyle=n.id===selected?'#214b55':'#122b34';ctx.fillRect(b.x-b.w/2,b.y-b.h/2,b.w,b.h);ctx.strokeStyle=mapKey.domainById.get(mapKey.groupOf(n)).color;ctx.lineWidth=n.id===selected?3:1;ctx.beginPath();ctx.moveTo(b.x-b.w/2,b.y+b.h/2);ctx.lineTo(b.x+b.w/2,b.y+b.h/2);ctx.stroke();ctx.fillStyle='#f3f9fa';ctx.font='600 14px system-ui';ctx.textAlign='center';const label=n.label.length>24?n.label.slice(0,22)+'…':n.label;ctx.fillText(label,b.x,b.y+5);}
   ctx.textAlign='start';
  }
  function requestDraw(){if(frame!==null||destroyed||document.hidden)return;frame=window.requestAnimationFrame?window.requestAnimationFrame(draw):window.setTimeout(draw,16);}
  function resize(){const r=canvas.getBoundingClientRect();width=Math.max(320,r.width||960);height=Math.max(620,r.height||620);layout();height=Math.max(height,parseInt(canvas.style.minHeight)||0);const ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=width*ratio;canvas.height=height*ratio;draw();}
  function point(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  function hit(p){return view.nodes.find(n=>{const b=box(n);return Math.abs(p.x-b.x)<b.w/2&&Math.abs(p.y-b.y)<b.h/2;});}
  listen(canvas,'pointerdown',e=>{drag={...point(e),panX,panY,moved:false};canvas.setPointerCapture?.(e.pointerId);});
  listen(canvas,'pointermove',e=>{const p=point(e);if(drag){const dx=p.x-drag.x,dy=p.y-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(drag.moved){panX=drag.panX+dx;panY=drag.panY+dy;requestDraw();return;}}const node=hit(p);const label=labels.find(l=>Math.abs(p.x-l.x)<l.w/2&&Math.abs(p.y-l.y)<l.h);tooltip.hidden=!node&&!label;tooltip.textContent=node?node.label:label?human(label.edge.relation)+' · '+(label.edge.scope||'Read source conditions in evidence'):'';tooltip.style.left=Math.max(5,Math.min(width-220,p.x))+'px';tooltip.style.top=Math.max(5,p.y-40)+'px';canvas.style.cursor=node||label?'pointer':'grab';});
  listen(canvas,'pointerup',e=>{if(drag&&!drag.moved){const p=point(e),node=hit(p);if(node)onSelect(node.id);else {const label=labels.find(l=>Math.abs(p.x-l.x)<l.w/2&&Math.abs(p.y-l.y)<l.h);if(label)onEdge(label.edge);}}drag=null;});
  listen(canvas,'pointercancel',()=>{drag=null;});
  listen(canvas,'pointerleave',()=>{tooltip.hidden=true;});
  listen(canvas,'wheel',e=>{e.preventDefault();zoom=Math.max(.6,Math.min(3,zoom*(e.deltaY<0?1.1:1/1.1)));requestDraw();},{passive:false});
  listen(window,'resize',resize);listen(document,'visibilitychange',()=>{if(document.hidden&&frame!==null){(window.cancelAnimationFrame||window.clearTimeout)(frame);frame=null;}else requestDraw();});
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;observer?.observe(canvas);resize();
  return {select(id){if(!id)id=atlas.nodes.some(n=>n.id==='force')?'force':atlas.nodes[0]?.id;if(selected!==id){selected=id;offset=-1;zoom=1;panX=panY=0;resize();}},topic(){},focusEdge(){},zoom(f){zoom=Math.max(.6,Math.min(3,zoom*f));draw();},fit(){zoom=1;panX=panY=0;draw();},next(){offset=offset<0?0:(offset+view.limit>=view.totalNeighbors)?0:offset+view.limit;zoom=1;panX=panY=0;resize();},counts(){return {nodes:view.nodes.length,edges:view.edges.length,connected:view.totalNeighbors,offset};},snapshot(){return {selected,limit:view.limit,nodes:view.nodes.map(n=>({id:n.id,...screen(n.id)})),edges:view.edges,labels:[...labels]};},destroy(){destroyed=true;listeners.forEach(fn=>fn());observer?.disconnect();if(frame!==null)(window.cancelAnimationFrame||window.clearTimeout)(frame);}};
 }
 window.PhysicsNetwork={mount};
})();
