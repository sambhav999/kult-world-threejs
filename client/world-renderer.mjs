import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWorldModel, DISTRICTS } from './world-model.mjs';

export class WorldRenderer {
  constructor({mount,labels,onSelect,onFailure,onReady,onStats}) {
    this.mount=mount;this.labels=labels;this.onSelect=onSelect;this.onFailure=onFailure;this.onStats=onStats;
    this.disposed=false;this.active=true;this.visible=true;this.follow=false;this.motion=!(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches??false);
    this.clock=0;this.frames=0;this.lastFrame=0;this.lastStats=0;this.currentLocation='home';
    const canvas=document.createElement('canvas');
    canvas.setAttribute('aria-label','Interactive 3D model of Radiant Hollow. Use district buttons below to explore.');
    canvas.setAttribute('role','img');
    const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'low-power'});
    if(!gl)throw new Error('WebGL 2 is unavailable on this device.');
    try{
      this.renderer=new THREE.WebGLRenderer({canvas,context:gl,antialias:true,alpha:false});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3;
      this.renderer.shadowMap.enabled=false;
      this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#101d30');
      this.scene.fog=new THREE.FogExp2('#101d30',.012);
      this.camera=new THREE.PerspectiveCamera(39,1,.1,150);this.camera.position.set(18,20,24);
      this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(0,-.1,0);
      this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.enablePan=false;
      this.controls.minDistance=12;this.controls.maxDistance=52;this.controls.minPolarAngle=.3;this.controls.maxPolarAngle=1.35;
      this.controls.rotateSpeed=.6;this.controls.zoomSpeed=.7;this.controls.update();
      this.scene.add(new THREE.HemisphereLight('#d7eaff','#24304a',2.4));
      this.sun=new THREE.DirectionalLight('#ffebcf',3.3);this.sun.position.set(-10,18,12);this.scene.add(this.sun);
      this.rim=new THREE.DirectionalLight('#8bafff',2.8);this.rim.position.set(12,8,-10);this.scene.add(this.rim);
      this.model=createWorldModel();this.scene.add(this.model.root);
      this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.projected=new THREE.Vector3();
      this.labelNodes=DISTRICTS.map(d=>{const button=document.createElement('button');button.className='world3dLabel';button.dataset.zone=d.id;button.type='button';button.textContent=d.name;button.setAttribute('aria-label',`Select ${d.name}`);button.addEventListener('click',()=>this.select(d.id));labels.append(button);return {d,button};});
      this.mount.append(canvas);
      this.abort=new AbortController();const opts={signal:this.abort.signal};
      this.pointers=new Set();this.multiTouch=false;
      canvas.addEventListener('pointerdown',e=>{this.pointers.add(e.pointerId);if(this.pointers.size>1)this.multiTouch=true;this.startPointer={x:e.clientX,y:e.clientY,id:e.pointerId};},opts);
      canvas.addEventListener('pointerup',e=>{const p=this.startPointer,multiple=this.multiTouch;this.startPointer=null;this.pointers.delete(e.pointerId);if(!this.pointers.size)this.multiTouch=false;if(multiple||!p||e.pointerId!==p.id||Math.hypot(e.clientX-p.x,e.clientY-p.y)>7)return;const id=this.hit(e);if(id)this.select(id);},opts);
      canvas.addEventListener('pointercancel',e=>{this.startPointer=null;this.pointers.delete(e.pointerId);if(!this.pointers.size)this.multiTouch=false;},opts);
      canvas.addEventListener('pointermove',e=>{if(e.buttons)return;canvas.style.cursor=this.hit(e)?'pointer':'grab';},opts);
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.fail('The 3D graphics connection was lost. You can continue on the 2D map.');},opts);
      this.controls.addEventListener('start',()=>{this.follow=false;});
      this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(mount);
      this.intersectionObserver=new IntersectionObserver(entries=>{this.visible=entries[0]?.isIntersecting??true;this.syncLoop();},{threshold:0});this.intersectionObserver.observe(mount);
      document.addEventListener('visibilitychange',()=>this.syncLoop(),opts);
      this.resize();this.renderer.render(this.scene,this.camera);this.syncLoop();onReady?.();
    }catch(error){this.dispose();throw error;}
  }
  hit(event){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);return this.raycaster.intersectObjects(this.model.pickables,false)[0]?.object.userData.district;}
  select(id){if(!this.model.zones.has(id))return;this.model.select(id);this.selected=id;for(const {d,button} of this.labelNodes)button.setAttribute('aria-pressed',String(id===d.id));this.onSelect?.(id);}
  resize(){if(this.disposed)return;const w=this.mount.clientWidth,h=this.mount.clientHeight;if(w<1||h<1)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
  setActive(value){this.active=Boolean(value);this.resize();this.syncLoop();}
  setMotion(value){this.motion=value;}
  setQuality(value){this.renderer.setPixelRatio(value==='low'?1:Math.min(devicePixelRatio||1,1.5));this.resize();}
  setDay(value){this.scene.background.set(value?'#839ead':'#101d30');this.scene.fog.color.copy(this.scene.background);this.sun.intensity=value?4:3.3;this.rim.intensity=value?1.4:2.8;}
  zoom(amount){const offset=this.camera.position.clone().sub(this.controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*amount,this.controls.minDistance,this.controls.maxDistance));this.camera.position.copy(this.controls.target).add(offset);this.controls.update();}
  reset(){this.follow=false;this.controls.target.set(0,-.1,0);const narrow=this.mount.clientWidth<550;this.camera.position.set(18,20,24).multiplyScalar(narrow?1.17:1);this.controls.update();}
  rotate(amount){const offset=this.camera.position.clone().sub(this.controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),amount);this.camera.position.copy(this.controls.target).add(offset);this.controls.update();}
  findAgent(){this.follow=true;const p=this.model.agent.position;this.controls.target.copy(p);this.camera.position.copy(p).add(new THREE.Vector3(8,9,11));this.controls.update();}
  updateState(snapshot){if(snapshot.agent)this.model.setAgent(snapshot.agent);this.model.setEventProgress(snapshot.world?.observatory||0);if(snapshot.location&&snapshot.location!==this.currentLocation){this.currentLocation=snapshot.location;this.model.moveTo(snapshot.location,!this.motion);}this.setActive(snapshot.view==='world'&&Boolean(snapshot.agent));}
  syncLoop(){if(!this.renderer||this.disposed)return;const run=this.active&&this.visible&&!document.hidden;this.renderer.setAnimationLoop(run?timestamp=>this.frame(timestamp):null);this.lastFrame=0;}
  frame(timestamp){
    if(this.disposed)return;
    try{
      if(this.lastFrame&&timestamp-this.lastFrame<1000/31)return;
      const delta=this.lastFrame?Math.min((timestamp-this.lastFrame)/1000,.1):0;this.lastFrame=timestamp;this.clock+=delta;
      this.model.update(this.clock,delta,this.motion);
      if(this.follow){const shift=this.model.agent.position.clone().sub(this.controls.target).multiplyScalar(.08);this.controls.target.add(shift);this.camera.position.add(shift);}
      this.controls.update();this.renderer.render(this.scene,this.camera);
      const w=this.mount.clientWidth,h=this.mount.clientHeight,occupied=[];
      for(const {d,button} of this.labelNodes){
        this.projected.set(d.x,d.height+.7,d.z).project(this.camera);
        const x=(this.projected.x*.5+.5)*w,y=(-this.projected.y*.5+.5)*h;
        const inside=this.projected.z>-1&&this.projected.z<1&&x>65&&x<w-65&&y>45&&y<h-38;
        const collision=occupied.some(p=>Math.abs(p.x-x)<132&&Math.abs(p.y-y)<34);
        const show=inside&&!collision&&w>=550;
        button.hidden=!show;if(show){button.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%)`;occupied.push({x,y});}
      }
      this.frames++;if(timestamp-this.lastStats>1100){this.onStats?.({fps:Math.round(this.frames*1000/(timestamp-this.lastStats)),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles});this.frames=0;this.lastStats=timestamp;}
    }catch(error){this.fail('The 3D view could not render. Continue with the 2D map.');}
  }
  fail(message){this.dispose();this.onFailure?.(message);}
  dispose(){if(this.disposed)return;this.disposed=true;this.abort?.abort();this.resizeObserver?.disconnect();this.intersectionObserver?.disconnect();this.controls?.dispose();this.model?.dispose();this.renderer?.setAnimationLoop(null);this.renderer?.dispose();this.renderer?.domElement.remove();this.labelNodes?.forEach(({button})=>button.remove());}
}
