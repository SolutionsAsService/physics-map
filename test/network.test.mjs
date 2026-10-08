import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
for (const initialWidth of [1200,390]) test('unified real renderer with canvas spy: all claims, fixed positions, direction, gestures and disposal '+initialWidth, async () => {
  const dom=new JSDOM('<div><canvas tabindex="0"></canvas><div id="tip"></div></div>',{runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,c=w.document.querySelector('canvas');let width=initialWidth,strokes=[],fills=[],path=[],draws=0,arcs=0;
  c.getBoundingClientRect=()=>({width,height:620,left:0,top:0});
  c.getContext=()=>({setTransform(){},clearRect(){strokes=[];fills=[];arcs=0;draws++;},setLineDash(){},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},arc(){arcs++;},stroke(){strokes.push({path:[...path],alpha:this.globalAlpha});},fill(){fills.push([...path]);},fillRect(){},fillText(){}});
  let disconnected=false;w.ResizeObserver=class{observe(){}disconnect(){disconnected=true;}};
  for(const f of ['map-key','graph-view','network'])w.eval(await readFile(new URL('../src/'+f+'.js',import.meta.url),'utf8'));
  const a=w.PhysicsGraphView.connectedCore(JSON.parse(await readFile(new URL('../data/atlas.json',import.meta.url))));
  const original=JSON.stringify(a);let picked,edgePicked;
  const map=w.PhysicsNetwork.mount(c,w.document.querySelector('#tip'),a,id=>{picked=id;map.select(id);},e=>edgePicked=e);
  const click=p=>{for(const type of ['pointerdown','pointerup'])c.dispatchEvent(new w.MouseEvent(type,{clientX:p.x,clientY:p.y}));};
  const event=(type,x,y,id=1)=>{const e=new w.MouseEvent(type,{clientX:x,clientY:y});Object.defineProperty(e,'pointerId',{value:id});c.dispatchEvent(e);};
  const checkAll=()=>{assert.equal(map.counts().nodes,521);assert.equal(map.counts().edges,1223);assert.equal(arcs,521);assert.equal(strokes.filter(s=>s.path.length===2).length,1223,'every directed claim rendered exactly once');assert.deepEqual(map.snapshot().edges.map(e=>e.id),a.edges.map(e=>e.id));};
  checkAll();let snap=map.snapshot();assert.equal(snap.selected,null);assert.ok(snap.nodeLabels.length>5);assert.ok(snap.nodeLabels.length<100);assert.ok(snap.nodes.every(n=>n.x>=49&&n.x<=width-49&&n.y>=49&&n.y<=571));
  const layouts=JSON.stringify(snap.nodes.map(n=>n.layout));
  for(const id of ['force','net_force','acceleration','ion']){
    map.select(id);snap=map.snapshot();checkAll();assert.equal(JSON.stringify(snap.nodes.map(n=>n.layout)),layouts);
    const expected=a.edges.filter(e=>e.source===id||e.target===id);
    assert.deepEqual(snap.focusedEdges.map(e=>e.id),expected.map(e=>e.id));assert.equal(strokes.filter(s=>s.path.length===2&&s.alpha===.95).length,expected.length);
    assert.ok(snap.nodeLabels.some(l=>l.text===a.nodes.find(n=>n.id===id).label));
    assert.ok(!snap.focusedEdges.some(e=>e.source==='acceleration'&&e.target==='net_force'&&e.kind==='causation'));
  }
  for(const node of a.nodes){map.select(node.id);assert.equal(map.counts().nodes,521);assert.equal(map.counts().edges,1223);assert.equal(map.counts().highlighted,a.edges.filter(e=>e.source===node.id||e.target===node.id).length);assert.equal(strokes.filter(s=>s.path.length===2).length,1223);}
  map.select('net_force');snap=map.snapshot();const cause=snap.focusedEdges.find(e=>e.target==='acceleration'&&e.relation==='causes');assert.ok(cause);
  const from=snap.nodes.find(n=>n.id===cause.source),to=snap.nodes.find(n=>n.id===cause.target);
  const head=fills.find(p=>p.length===3&&Math.hypot(p[0][0]-to.x,p[0][1]-to.y)<12);assert.ok(head,'filled causal arrow ends at acceleration');
  assert.ok(Math.hypot(head[0][0]-to.x,head[0][1]-to.y)<Math.hypot(head[0][0]-from.x,head[0][1]-from.y));
  map.zoom(2);snap=map.snapshot();const label=snap.labels.find(l=>l.edge.id===cause.id);
  if(label){click(label);assert.equal(edgePicked.id,cause.id);}else{map.focusEdge(cause.id);assert.ok(map.snapshot().focusedEdges.includes(cause));}
  map.select('acceleration');snap=map.snapshot();click(snap.nodes.find(n=>n.id==='acceleration'));assert.equal(picked,'acceleration');
  const before=map.snapshot();map.zoom(1.3);assert.notEqual(map.snapshot().scale,before.scale);
  event('pointerdown',10,10);event('pointermove',70,90);event('pointerup',70,90);assert.notEqual(map.snapshot().centerX,before.centerX);
  const prePinch=map.snapshot().scale;event('pointerdown',100,100,1);event('pointerdown',200,100,2);event('pointermove',250,100,2);assert.ok(map.snapshot().scale>prePinch);event('pointercancel',0,0,1);
  c.dispatchEvent(new w.WheelEvent('wheel',{clientX:100,clientY:200,deltaY:-10,cancelable:true}));
  c.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',cancelable:true}));
  width+=50;w.dispatchEvent(new w.Event('resize'));assert.ok(map.snapshot().nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
  map.topic(a.documents[0].graphId);checkAll();map.select(null);map.fit();checkAll();assert.equal(map.snapshot().selected,null);assert.equal(map.snapshot().focusedEdges.length,0);
  assert.equal(JSON.stringify(a),original,'renderer never mutates source data');
  let hidden=false;Object.defineProperty(w.document,'hidden',{configurable:true,get:()=>hidden});
  event('pointerdown',10,10);event('pointermove',60,50);hidden=true;w.document.dispatchEvent(new w.Event('visibilitychange'));const paused=draws;await new Promise(r=>setTimeout(r,25));assert.equal(draws,paused,'hidden document cancels pending drawing');hidden=false;w.document.dispatchEvent(new w.Event('visibilitychange'));await new Promise(r=>setTimeout(r,25));assert.ok(draws>paused);event('pointercancel',0,0);
  event('pointerdown',10,10);event('pointermove',60,50);const count=draws;map.destroy();assert.equal(disconnected,true);
  w.dispatchEvent(new w.Event('resize'));c.dispatchEvent(new w.WheelEvent('wheel',{deltaY:-10}));await new Promise(r=>setTimeout(r,30));assert.equal(draws,count,'listeners and scheduled frame disposed');dom.window.close();
});
