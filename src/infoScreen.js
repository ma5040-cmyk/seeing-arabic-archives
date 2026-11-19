import { arabicArchiveDate, arabicDigits, titleArabic, translateMedia, translatePlace } from './bilingual.js?v=2';

export class InfoScreen {
  constructor(mesh,archives) {
    this.mesh=mesh;
    this.archives=archives;
    mesh.geometry.computeBoundingBox();
    const bounds=mesh.geometry.boundingBox;
    const spans=[
      (bounds.max.x-bounds.min.x)*mesh.scale.x,
      (bounds.max.y-bounds.min.y)*mesh.scale.y,
      (bounds.max.z-bounds.min.z)*mesh.scale.z
    ].sort((a,b)=>b-a);
    this.aspect=spans[1]>0?spans[0]/spans[1]:2;
    this.canvas=document.createElement('canvas');
    this.canvas.width=1024;
    this.canvas.height=Math.round(this.canvas.width/this.aspect);
    this.ctx=this.canvas.getContext('2d');
    this.log=[];
  }
  async init(THREE) {
    this.shaderMaterial=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0}},
      vertexShader:`
        varying vec2 vUv;
        void main(){
          vUv=uv;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader:`
        uniform float uTime;
        varying vec2 vUv;
        float noise(vec2 p){
          vec2 i=floor(p),f=fract(p);
          f=f*f*(3.0-2.0*f);
          float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5453);
          float b=fract(sin(dot(i+vec2(1.0,0.0),vec2(127.1,311.7)))*43758.5453);
          float c=fract(sin(dot(i+vec2(0.0,1.0),vec2(127.1,311.7)))*43758.5453);
          float d=fract(sin(dot(i+vec2(1.0,1.0),vec2(127.1,311.7)))*43758.5453);
          return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
        }
        void main(){
          vec2 uv=vUv;
          uv.x+=sin(uv.y*28.0+uTime*0.55)*0.004;
          float n=noise(vec2(uv.x*13.0+uTime*0.025,uv.y*8.0));
          float duneA=0.30+0.12*sin(uv.x*7.0+uTime*0.08)+0.05*sin(uv.x*15.0-uTime*0.045)+n*0.035;
          float duneB=0.48+0.10*sin(uv.x*5.2-uTime*0.06+1.6)+0.045*sin(uv.x*12.0+uTime*0.04);
          float duneC=0.67+0.09*sin(uv.x*4.4+uTime*0.05+3.0);
          vec3 sky=mix(vec3(0.43,0.48,0.51),vec3(0.67,0.65,0.59),smoothstep(0.45,0.86,uv.y));
          vec3 sand=mix(vec3(0.31,0.29,0.25),vec3(0.65,0.53,0.37),0.34+0.34*n);
          float haze=sin(uv.y*92.0+uTime*1.1+noise(uv*16.0)*2.0)*0.012;
          float ridge=smoothstep(duneA-0.012,duneA+0.012,uv.y+haze);
          vec3 color=mix(sky,sand,ridge);
          float ridge2=smoothstep(duneB-0.018,duneB+0.018,uv.y+haze);
          color=mix(color,sand*vec3(0.9,0.88,0.83),ridge2*0.86);
          float ridge3=smoothstep(duneC-0.02,duneC+0.02,uv.y+haze);
          color=mix(color,sand*vec3(1.04,1.02,0.96),ridge3*0.78);
          gl_FragColor=vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      side:THREE.DoubleSide,
      fog:false,
      toneMapped:false
    });
    this.mesh.material=this.shaderMaterial;
    this.mesh.material.needsUpdate=true;
    this.overlayCanvas=new THREE.CanvasTexture(this.canvas);
    this.overlayCanvas.colorSpace=THREE.SRGBColorSpace;
    this.overlayCanvas.minFilter=THREE.LinearFilter;
    this.overlay=this.mesh.clone();
    this.overlay.material=new THREE.MeshBasicMaterial({
      map:this.overlayCanvas,transparent:true,side:THREE.DoubleSide,
      depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,
      polygonOffsetUnits:-1,toneMapped:false,fog:false
    });
    this.overlay.renderOrder=this.mesh.renderOrder+1;
    this.overlay.position.z+=0.003;
    this.mesh.parent.add(this.overlay);
    await this.prepareDesertVideo(THREE);
  }
  async prepareDesertVideo(THREE) {
    const video=document.createElement('video');
    this.desertVideo=video;
    video.src='./media/DESERT.mp4';
    video.loop=true;video.muted=true;video.playsInline=true;video.preload='auto';
    video.addEventListener('error',()=>console.warn('Could not load media/DESERT.mp4; keeping procedural desert.'),{once:true});
    const loaded=new Promise(resolve=>{
      video.addEventListener('loadedmetadata',resolve,{once:true});
      video.addEventListener('error',resolve,{once:true});
    });
    video.load();
    await loaded;
    if(video.error)return;
    if(!Number.isFinite(video.duration)||video.duration<.1||!video.videoWidth||!video.videoHeight){
      console.warn(`media/DESERT.mp4 is not a decodable video; keeping the procedural desert.`);
      return;
    }
    this.desertAvailable=true;
    const texture=new THREE.VideoTexture(video);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.minFilter=THREE.LinearFilter;
    texture.flipY=false;
    const videoAspect=video.videoWidth/video.videoHeight;
    texture.repeat.set(1,1);
    texture.offset.set(0,0);
    const imageScale=videoAspect>this.aspect
      ?new THREE.Vector2(this.aspect/videoAspect,1)
      :new THREE.Vector2(1,videoAspect/this.aspect);
    this.mesh.material=new THREE.MeshBasicMaterial({
      map:texture,side:THREE.DoubleSide,toneMapped:false,fog:false
    });
    this.mesh.material.onBeforeCompile=shader=>{
      shader.uniforms.archiveImageScale={value:imageScale};
      shader.fragmentShader=shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nuniform vec2 archiveImageScale;'
      );
      shader.fragmentShader=shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
        vec2 archiveUv = (vMapUv - vec2(0.5)) / archiveImageScale + vec2(0.5);
        bool archiveImageVisible = all(greaterThanEqual(archiveUv, vec2(0.0))) &&
          all(lessThanEqual(archiveUv, vec2(1.0)));
        vec4 archiveSample = archiveImageVisible
          ? texture2D(map, archiveUv)
          : vec4(vec3(0.015), 1.0);
        diffuseColor *= archiveSample;
        #endif`
      );
    };
    this.mesh.material.customProgramCacheKey=()=> 'archive-desert-video-fit';
    this.desertTexture=texture;
  }
  async playVideo() {
    if(!this.desertAvailable||!this.desertVideo||this.desertVideo.error)return;
    this.desertVideo.muted=true;
    this.desertVideo.loop=true;
    this.desertVideo.playsInline=true;
    this.desertVideo.preload='auto';
    try {
      await this.desertVideo.play();
    } catch (error) {
      if(error.name!=='NotAllowedError'&&error.name!=='AbortError')throw error;
      this.onGesture=()=>this.playVideo().catch(playError=>console.error('Could not start media/DESERT.mp4:',playError));
      addEventListener('pointerdown',this.onGesture,{once:true});
      addEventListener('keydown',this.onGesture,{once:true});
    }
  }
  pauseVideo() {
    this.desertVideo?.pause();
    if(this.onGesture){
      removeEventListener('pointerdown',this.onGesture);
      removeEventListener('keydown',this.onGesture);
      this.onGesture=null;
    }
  }
  dispose() {
    this.pauseVideo();
    this.desertVideo?.removeAttribute('src');
    this.desertVideo?.load();
    this.desertTexture?.dispose();
    this.overlayCanvas?.dispose();
    this.overlay?.parent?.remove(this.overlay);
  }
  haversineKm(lat1,lon1,lat2,lon2) {
    const r=6371,toRad=x=>x*Math.PI/180;
    const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
    const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return r*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  focusItem(item,hour) {
    this.item=item;
    this.hour=hour;
    if(!item)return;
    const archive=this.archiveFor(item);
    this.log.unshift({
      date:new Date(),
      item,
      archive
    });
    this.log=this.log.slice(0,3);
  }
  archiveFor(item) {
    return item?.archive||this.archives.find(archive=>archive.id===item?.archive_id)||{};
  }
  update(dt) {
    if(this.mesh.material===this.shaderMaterial)this.shaderMaterial.uniforms.uTime.value+=dt;
  }
  draw() {
    const c=this.ctx,w=this.canvas.width,h=this.canvas.height;
    c.clearRect(0,0,w,h);
    c.fillStyle='#f0f1f1';c.textBaseline='top';
    let y=h*.805;
    const item=this.item||{},archive=this.archiveFor(item);
    const title=item.title||archive.name||'No item assigned';
    const titleAr=titleArabic(item,archive);
    const year=item.date||[archive.start,archive.end].filter(Boolean).join('–')||'undated';
    const city=item.place||archive.city||'Not recorded';
    const cityAr=translatePlace(city);
    const media=item.media||item.type||archive.media||'archive';
    const mediaAr=translateMedia(media);
    this.entry(year,`${title} [ ${city} ] / ${media}`,`${arabicArchiveDate(year)} / ${titleAr} [ ${cityAr} ] / ${mediaAr}`,y);
    y+=34;
    const archiveName=item.held_by||archive.name||item.archive_id||'Unidentified archive';
    const position=item.holder_pos||archive.pos||'';
    const positionAr=({RI:'داخل المنطقة · مستقل / مجتمعي',RS:'داخل المنطقة · حكومي / جامعي',OW:'خارج المنطقة · مؤسسة أجنبية',DI:'شتات',EX:'خارجي'})[position]||'غير محدد';
    const online=archive.online||((archive.online_est&&Number(archive.online_est)>0)
      ?`${Number(archive.online_est).toLocaleString('en-GB')} online`:'online access unconfirmed');
    this.pair(`${archiveName} / ${position||'holder unrecorded'} / ${online}`,
      `${archive.name_ar||titleAr} / ${positionAr} / ${archive.online_est?arabicDigits(archive.online_est)+' متاح رقمياً':'الوصول الرقمي غير محدد'}`,y,15);
    this.overlayCanvas.needsUpdate=true;
  }
  entry(year,english,arabic,y) {
    const c=this.ctx,w=this.canvas.width;
    c.textAlign='left';c.direction='ltr';c.fillStyle='#fff';
    c.font='700 18px "Times New Roman",serif';
    c.fillText(`${year} /`,28,y);
    const yearWidth=c.measureText(`${year} / `).width;
    c.font='18px "Times New Roman",serif';
    c.fillText(english,28+yearWidth,y);
    c.direction='rtl';c.textAlign='right';
    c.font='17px "IBM Plex Sans Arabic","Times New Roman",serif';
    c.fillText(arabic,w-28,y+20);
  }
  pair(english,arabic,y,fontSize=17) {
    const c=this.ctx,w=this.canvas.width;
    c.fillStyle='#f0f1f1';c.direction='ltr';c.textAlign='left';
    c.font=`${fontSize}px "Times New Roman",serif`;
    c.fillText(english,28,y,w-56);
    c.direction='rtl';c.textAlign='right';
    c.font=`${Math.max(14,fontSize-1)}px "IBM Plex Sans Arabic","Times New Roman",serif`;
    c.fillText(arabic,w-28,y+18,w-56);
  }
  distanceKm(item,archive) {
    const shownLat=Number(item.lat??archive.lat),shownLon=Number(item.lon??archive.lon);
    const heldLat=Number(item.held_lat??archive.held_lat),heldLon=Number(item.held_lon??archive.held_lon);
    if(![shownLat,shownLon,heldLat,heldLon].every(Number.isFinite))return null;
    return this.haversineKm(shownLat,shownLon,heldLat,heldLon);
  }
}
