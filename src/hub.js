import * as THREE from 'three';
import { ABJAD } from './zairja.js';

export class Hub {
  constructor({scene,camera,renderer}) { this.scene=scene;this.camera=camera;this.renderer=renderer; }
  async init(){
    document.querySelector('#skip').style.display='none';
    document.querySelector('#opening-cards').style.opacity='1';
    this.scene.background=new THREE.Color(0x8e959c);
    const mode=document.querySelector('#mode-label');
    mode.querySelector('.mode-en').textContent='Rooms';
    mode.querySelector('.mode-ar').textContent='الغرف';
    this.camera.position.set(0,1.6,8);
    this.wheel=new THREE.Group(); this.scene.add(this.wheel);
    ABJAD.forEach(([letter,value],i)=>{
      const canvas=document.createElement('canvas'); canvas.width=160; canvas.height=160;
      const ctx=canvas.getContext('2d'); ctx.direction='rtl'; ctx.fillStyle='#d8d4c8';
      ctx.font='700 80px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(letter,80,82);
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true}));
      const ring=i<10?0:i<20?1:2, angles=[i,i-10,i-20][ring];
      const radius=[2.2,3.25,4.3][ring], a=angles/10*Math.PI*2;
      sprite.position.set(Math.cos(a)*radius,Math.sin(a)*radius*.72,0);
      sprite.scale.set(.7,.7,.7); this.wheel.add(sprite);
    });
    const nav=document.querySelector('#room-nav');
    nav.style.display='flex';
    nav.querySelector('[data-room="cafe"]').textContent='The Internet Café / مقهى الإنترنت';
    nav.querySelector('[data-room="cafe"]').onclick=()=>window.dispatchEvent(new Event('seeing-archives:enter-cafe'));
  }
  update(dt){ if(this.wheel)this.wheel.rotation.z+=dt*.018; }
}
