import * as THREE from 'three';

export class ScreenMedia {
  constructor(screen,item,renderer) {
    this.screen=screen;
    this.item=item||{type:'absence'};
    this.renderer=renderer;
    this.showPlaceholder();
  }
  static create(screen,item,renderer) {
    return new ScreenMedia(screen,item,renderer);
  }
  showPlaceholder() {
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=288;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#c9cccf';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    this.placeholderTexture=new THREE.CanvasTexture(canvas);
    this.placeholderTexture.colorSpace=THREE.SRGBColorSpace;
    this.placeholderTexture.minFilter=THREE.LinearFilter;
    this.setTexture(this.placeholderTexture,false);
  }
  setTexture(texture,disposePrevious=true) {
    if(disposePrevious)this.contentTexture?.dispose();
    this.contentTexture=texture;
    const material=new THREE.MeshBasicMaterial({
      map:texture,color:0xffffff,side:THREE.DoubleSide,toneMapped:false,fog:false,
      transparent:true,opacity:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1
    });
    material.onBeforeCompile=shader=>{
      shader.uniforms.archiveImageScale={value:this.imageScale||new THREE.Vector2(1,1)};
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
      shader.fragmentShader=shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float screenLuminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(vec3(screenLuminance), diffuseColor.rgb, 0.82);`
      );
    };
    material.customProgramCacheKey=()=> 'archive-screen-fit-desaturate-0.82';
    this.screen.material.dispose();
    this.screen.material=material;
    texture.needsUpdate=true;
  }
  fitTexture(texture,width,height){
    const target=this.screen.geometry.parameters.width/this.screen.geometry.parameters.height;
    const source=width/height;
    texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
    texture.repeat.set(1,1);
    texture.offset.set(0,0);
    this.imageScale=source>target
      ?new THREE.Vector2(target/source,1)
      :new THREE.Vector2(1,source/target);
    texture.needsUpdate=true;
  }
  setOpacity(value) {
    if(this.screen.material){
      this.screen.material.opacity=value;
      this.screen.material.transparent=true;
    }
  }
  async play() {
    if(this.item.type==='video')return this.playVideo();
    if(this.item.type==='image')return this.playImage();
  }
  async playImage() {
    const src=this.item?.src||this.item?.url;
    if(!src||this.imageBitmap)return;
    const image=new Image();
    image.decoding='async';
    image.crossOrigin='anonymous';
    await new Promise((resolve,reject)=>{
      image.onload=resolve;
      image.onerror=()=>reject(new Error(`Could not load screen image: ${src}`));
      image.src=src;
    });
    const scale=Math.min(1,1024/Math.max(image.naturalWidth,image.naturalHeight));
    const bitmap=await createImageBitmap(image,{
      imageOrientation:'flipY',
      resizeWidth:Math.max(1,Math.round(image.naturalWidth*scale)),
      resizeHeight:Math.max(1,Math.round(image.naturalHeight*scale)),
      resizeQuality:'high'
    });
    this.imageBitmap=bitmap;
    const texture=new THREE.Texture(bitmap);
    texture.flipY=false;
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.minFilter=THREE.LinearFilter;
    this.fitTexture(texture,bitmap.width,bitmap.height);
    this.setTexture(texture);
  }
  async playVideo() {
    const src=this.item?.src||this.item?.url;
    if(!src)return;
    if(!this.video){
      this.video=document.createElement('video');
      Object.assign(this.video,{loop:true,muted:true,playsInline:true,preload:'auto',crossOrigin:'anonymous'});
      this.video.src=src;
      const loaded=new Promise((resolve,reject)=>{
        this.video.addEventListener('loadeddata',resolve,{once:true});
        this.video.addEventListener('error',()=>reject(new Error(`Could not load screen video: ${src}`)),{once:true});
      });
      this.video.load();
      await loaded;
      this.videoTexture=new THREE.VideoTexture(this.video);
      this.videoTexture.colorSpace=THREE.SRGBColorSpace;
      this.videoTexture.minFilter=THREE.LinearFilter;
      this.fitTexture(this.videoTexture,this.video.videoWidth,this.video.videoHeight);
      this.setTexture(this.videoTexture,false);
    }
    this.video.muted=true;
    this.video.loop=true;
    this.video.playsInline=true;
    this.video.preload='auto';
    await this.video.play();
  }
  pause() { this.video?.pause(); }
  setLookedAt(value) {
    this.lookedAt=value;
    if(this.screen.material?.color)this.screen.material.color.setScalar(1+value*.06);
  }
  dispose() {
    this.pause();
    this.video?.removeAttribute('src');
    this.video?.load();
    this.videoTexture?.dispose();
    this.contentTexture?.dispose();
    this.placeholderTexture?.dispose();
    this.imageBitmap?.close();
    this.screen.material?.dispose();
  }
}
