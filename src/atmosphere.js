import * as THREE from 'three';

export function createSkyTexture(top='#D8DCDE',bottom='#F2F3F2') {
  const canvas=document.createElement('canvas');
  canvas.width=2; canvas.height=512;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,0,512);
  gradient.addColorStop(0,top);
  gradient.addColorStop(1,bottom);
  ctx.fillStyle=gradient; ctx.fillRect(0,0,2,512);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

export function createCloudTexture() {
  const canvas=document.createElement('canvas');
  canvas.width=512; canvas.height=256;
  const ctx=canvas.getContext('2d');
  for(let i=0;i<22;i++){
    const x=95+Math.random()*322, y=76+Math.random()*104;
    const radius=28+Math.random()*48;
    const gradient=ctx.createRadialGradient(x,y,0,x,y,radius);
    gradient.addColorStop(0,`rgba(168,175,182,${.48+Math.random()*.18})`);
    gradient.addColorStop(1,'rgba(142,149,156,0)');
    ctx.fillStyle=gradient;
    ctx.beginPath(); ctx.ellipse(x,y,radius,radius*.52,0,0,Math.PI*2); ctx.fill();
  }
  const noiseCanvas=document.createElement('canvas');
  noiseCanvas.width=64; noiseCanvas.height=32;
  const noiseCtx=noiseCanvas.getContext('2d');
  const noise=noiseCtx.createImageData(64,32);
  for(let i=0;i<noise.data.length;i+=4){
    const shade=130+Math.random()*125;
    noise.data[i]=shade;noise.data[i+1]=shade;noise.data[i+2]=shade;noise.data[i+3]=255;
  }
  noiseCtx.putImageData(noise,0,0);
  const scaledNoise=document.createElement('canvas');
  scaledNoise.width=512;scaledNoise.height=256;
  const scaledCtx=scaledNoise.getContext('2d');
  scaledCtx.imageSmoothingEnabled=true;
  scaledCtx.drawImage(noiseCanvas,0,0,512,256);
  const noisePixels=scaledCtx.getImageData(0,0,512,256).data;
  const cloudPixels=ctx.getImageData(0,0,512,256);
  for(let i=0;i<cloudPixels.data.length;i+=4){
    if(!cloudPixels.data[i+3])continue;
    const variation=.9+noisePixels[i]/255*.14;
    cloudPixels.data[i]=Math.min(255,cloudPixels.data[i]*variation);
    cloudPixels.data[i+1]=Math.min(255,cloudPixels.data[i+1]*variation);
    cloudPixels.data[i+2]=Math.min(255,cloudPixels.data[i+2]*variation);
    cloudPixels.data[i+3]*=.9+noisePixels[i]/255*.1;
  }
  ctx.putImageData(cloudPixels,0,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
