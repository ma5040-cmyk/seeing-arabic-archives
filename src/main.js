import * as THREE from 'three';
import { Opening } from './opening.js?v=62';
import { Hub } from './hub.js?v=15';
import { Cafe } from './cafe.js?v=69';

const app = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
renderer.setClearColor(0x000000, 0);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8e959c);
const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.05, 500);
camera.position.set(0, 1.6, 7);

let active = null;
let opening, hub, cafe;
let preloadedCafe = null;

function preloadCafe() {
  if (!preloadedCafe) preloadedCafe = new Cafe({ scene, camera, renderer });
  preloadedCafe.preloadRoom().catch(error => {
    console.error('Could not preload the café model', error);
  });
}

async function loadOpening(initialProgress=0,preserveFog=false) {
  window.inRoom=false;
  const fog=document.querySelector('#arrival-fog');
  fog.style.transition='none';
  if(!preserveFog)fog.style.opacity='0';
  document.body.classList.remove('arrival-fog');
  document.body.classList.remove('cafe-mode');
  active?.dispose?.();
  scene.clear();
  if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);
  opening = new Opening({ scene, camera, renderer });
  active = opening;
  delete window.seeingArabicArchives;
  window.seeingArabicArchivesOpening=opening;
  await opening.init();
  if(initialProgress)opening.setRideProgress(initialProgress,true);
  return opening;
}
async function loadHub() {
  active?.dispose?.();
  scene.clear();
  hub = new Hub({ scene, camera, renderer });
  active = hub;
  await hub.init();
  history.replaceState(null, '', `${location.pathname}${location.search}`);
}
async function loadCafe(keepCafeHash=false) {
  document.body.classList.remove('opening-later');
  document.body.classList.add('cafe-mode');
  const fog=document.querySelector('#arrival-fog');
  if(keepCafeHash)fog.style.opacity='0';
  active?.dispose?.();
  scene.clear();
  cafe = preloadedCafe || new Cafe({ scene, camera, renderer });
  preloadedCafe = null;
  active = cafe;
  await cafe.init();
  window.inRoom=true;
  delete window.seeingArabicArchivesOpening;
  window.seeingArabicArchives = { scene, camera, cafe, renderer };
  window.dispatchEvent(new CustomEvent('seeing-archives:room-arrived',{detail:{cafe}}));
  await cafe.startVideosOnArrival();
  fog.style.transition=keepCafeHash?'none':'opacity .4s ease';
  fog.style.opacity='0';
  if(!keepCafeHash)fog.addEventListener('transitionend',()=>{fog.style.transition='none';},{once:true});
  document.body.classList.remove('arrival-fog');
  history.replaceState(null, '', keepCafeHash?'#cafe':`${location.pathname}${location.search}`);
}

async function route() {
  if (location.hash === '#cafe') await loadCafe(true);
  else await loadOpening();
}

async function restartOpening() {
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  if(active===cafe){
    const fog=document.querySelector('#arrival-fog');
    fog.style.opacity='0';
    await loadOpening(0,true);
    return;
  }
  await loadOpening();
}

async function navigateToScene(scene) {
  const index=Number(scene);
  if(!Number.isInteger(index)||index<0||index>3)return;
  if(active===opening){
    opening.jumpToScene(index);
    return;
  }
  const fog=document.querySelector('#arrival-fog');
  fog.style.opacity='0';
  const instance=await loadOpening(0,true);
  instance.jumpToScene(index);
}

document.querySelector('#start-again').addEventListener('click', restartOpening);
document.querySelector('#site-title').addEventListener('click', restartOpening);
document.querySelectorAll('[data-opening-scene]').forEach(button=>{
  button.addEventListener('click',()=>navigateToScene(button.dataset.openingScene));
});
window.addEventListener('seeing-archives:enter-cafe',()=>loadCafe(false));
window.addEventListener('seeing-archives:preload-cafe',preloadCafe);
window.addEventListener('wheel',event=>{
  if(window.inRoom){
    event.preventDefault();
    if(active===cafe){
      cafe.handleWheel(event.deltaY);
    }
    return;
  }
  if(active!==opening)return;
  event.preventDefault();
  if(event.deltaY>0)opening.advanceRide(event.deltaY*.0008/3);
},{passive:false});
window.addEventListener('seeing-archives:open-hub',()=>loadHub());
window.addEventListener('keydown',event=>{
  if(event.key.toLowerCase()!=='r'||event.repeat||event.ctrlKey||event.metaKey)return;
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  restartOpening();
});
window.addEventListener('hashchange', route);
addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);
  if (active?.update) active.update(dt);
  renderer.render(scene, camera);
}
route();
animate();
