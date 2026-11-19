import * as THREE from 'three';
import { Rhino3dmLoader } from 'three/addons/loaders/3DMLoader.js';
import { InfoScreen } from './infoScreen.js?v=34';
import { ScreenMedia } from './screenMedia.js?v=33';
import { itemForSeat } from './zairja.js';
import { formatBilingualDateTime } from './time.js?v=2';
import { arabicDigits, translatePlace } from './bilingual.js?v=3';

function ensureUV(geometry) {
  const positions = geometry.attributes.position;
  if (!positions || geometry.attributes.uv) return;

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const spans = [
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z
  ];
  const axes = [0, 1, 2].sort((a, b) => spans[b] - spans[a]).slice(0, 2);
  const mins = [bounds.min.x, bounds.min.y, bounds.min.z];
  const uv = new Float32Array(positions.count * 2);

  for (let i = 0; i < positions.count; i++) {
    for (let j = 0; j < 2; j++) {
      const axis = axes[j];
      const span = spans[axis];
      uv[i * 2 + j] = span
        ? (positions.getComponent(i, axis) - mins[axis]) / span
        : 0;
    }
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function mediaSurfaces(screen) {
  const meshes=[];
  screen.traverse(object=>{if(object.isMesh)meshes.push(object);});
  if(meshes.length<2)return [screen];

  const parts=meshes.map(mesh=>{
    const bounds=new THREE.Box3().setFromObject(mesh);
    return {
      mesh,
      size:bounds.getSize(new THREE.Vector3()),
      center:bounds.getCenter(new THREE.Vector3())
    };
  });
  const pairs=[];
  for(let i=0;i<parts.length;i++){
    for(let j=i+1;j<parts.length;j++){
      const a=parts[i], b=parts[j];
      const similar=[0,1,2].every(axis=>
        Math.abs(a.size.getComponent(axis)-b.size.getComponent(axis))/
          Math.max(a.size.getComponent(axis),b.size.getComponent(axis))<0.04
      );
      if(similar&&a.center.distanceTo(b.center)>Math.max(...a.size.toArray())*0.25){
        pairs.push([a.mesh,b.mesh]);
      }
    }
  }
  if(pairs.length!==1)return [screen];

  // SCREEN_10 contains two matching display meshes inside one Rhino instance.
  return pairs[0].map((mesh,index)=>{
    mesh.userData.screenName=`${screen.name}_${String.fromCharCode(65+index)}`;
    return mesh;
  });
}

export class Cafe {
  constructor({scene,camera,renderer}) {
    this.scene=scene; this.camera=camera; this.renderer=renderer;
    this.smallScreens=[]; this.mediaScreens=[]; this.media=[]; this.curator=false; this.seated=null;
    this.ready=false;
  }
  async init(){
    this.ready=false;
    await document.fonts.load('400 18px "IBM Plex Sans Arabic"');
    this.config={smallScreens:[],pool:[{type:'absence'}],surfaces:{},dayDurationSeconds:1080};
    document.querySelector('#opening-cards').style.opacity='0';
    document.querySelector('#opening-network').style.display='none';
    document.querySelector('#room-nav').style.display='none';
    document.querySelector('#cafe-hud').classList.add('visible');
    document.querySelector('#rooms-button').onclick=()=>window.dispatchEvent(new Event('seeing-archives:open-hub'));
    document.querySelector('#skip').style.display='none';
    this.workLight=false;
    this.scene.fog=null;
    this.scene.background=new THREE.Color(0x8e959c);
    this.setMode('Archive room · Rhino view','غرفة الأرشيف · عرض راينو');
    this.config=await fetch('./data/screens.json').then(r=>r.json()).catch(()=>({smallScreens:[],pool:[],surfaces:{}}));
    this.archives=await this.loadArchives();
    this.edges=await this.loadEdges();
    this.clockStart=performance.now();
    this.hour=this.getHour();
    this.nextScreenToShuffle=1;
    this.lastGazeIndex=null;
    await this.loadRoom();
    this.findSurfaces();
    this.positionForScreens();
    await this.initInfo();
    await this.initMedia();
    this.configureScreenMaterials();
    this.setupLighting();
    await this.setupAtmosphere();
    this.setupInput();
    this.setupCurator();
    this.ready=true;
    this.updateArchiveBar();
  }
  parseCsv(text){
    const lines=text.trim().split(/\r?\n/), headers=this.parseLine(lines.shift());
    return lines.filter(Boolean).map(line=>{const v=this.parseLine(line);return Object.fromEntries(headers.map((h,i)=>[h,v[i]||'']));});
  }
  parseLine(line){const out=[];let v='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='\"'){if(q&&line[i+1]==='\"'){v+='\"';i++;}else q=!q;}else if(ch===','&&!q){out.push(v);v='';}else v+=ch;}out.push(v);return out;}
  async loadArchives(){
    try{return this.parseCsv(await fetch('./data/archives.csv').then(r=>r.text()));}catch{return[];}
  }
  async loadEdges(){
    const response=await fetch('./data/edges.csv');
    if(!response.ok)throw new Error(`Could not load archive network data (${response.status})`);
    return this.parseCsv(await response.text());
  }
  setMode(en,ar){
    const mode=document.querySelector('#mode-label');
    mode.querySelector('.mode-en').textContent=en;
    mode.querySelector('.mode-ar').textContent=ar;
  }
  async loadRoom(){
    this.room=await this.preloadRoom();
    this.room.rotation.x=-Math.PI/2;
    this.room.scale.setScalar(0.3048);
    this.scene.add(this.room);
    const viewsResponse=await fetch('./models/views.json');
    if(!viewsResponse.ok)throw new Error(`Could not load Rhino named views (${viewsResponse.status})`);
    const viewData=await viewsResponse.json();
    this.namedView=viewData.views?.find(view=>view.name===viewData.selected)||viewData.views?.[0]||null;
    const layersResponse=await fetch('./models/layers.json');
    if(!layersResponse.ok)throw new Error(`Could not load Rhino layer inventory (${layersResponse.status})`);
    this.printLayerInventory(await layersResponse.json());
  }
  preloadRoom(){
    if(!this.roomPromise){
      const loader=new Rhino3dmLoader();
      loader.setLibraryPath('./lib/rhino3dm/');
      this.roomPromise=loader.loadAsync('./models/cafe.3dm').catch(error=>{
        this.roomPromise=null;
        throw error;
      });
    }
    return this.roomPromise;
  }
  installRoom(){
    if(!this.room)return;
    this.scene.add(this.room);
    const box=new THREE.Box3().setFromObject(this.room);
    const size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
    if(size.y>size.x*3) this.room.rotation.x-=Math.PI/2;
    box.setFromObject(this.room);
    box.getSize(size); box.getCenter(center);
    this.room.position.sub(center);
    const scale=Math.min(1,12/Math.max(size.x,size.y,size.z));
    if(scale<1)this.room.scale.multiplyScalar(scale);
    box.setFromObject(this.room); box.getSize(size); box.getCenter(center);
    this.room.position.sub(center);
  }
  makePlaceholder(){
    const g=new THREE.Group();
    const mat=new THREE.MeshStandardMaterial({color:0x181818,roughness:1,metalness:0});
    const floor=new THREE.Mesh(new THREE.BoxGeometry(12,.12,10),mat); floor.position.y=-1.2; g.add(floor);
    const wall=new THREE.Mesh(new THREE.BoxGeometry(.12,5,10),mat); wall.position.set(-6,1.3,0); g.add(wall);
    const wall2=new THREE.Mesh(new THREE.BoxGeometry(12,5,.12),mat); wall2.position.set(0,1.3,-5); g.add(wall2);
    for(let i=0;i<8;i++){
      const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.72),new THREE.MeshBasicMaterial({color:0x4a4a38}));
      screen.name=`SCREEN_${String(i+1).padStart(2,'0')}`;
      screen.position.set(-4.8+i*1.38,1.3,-4.93);
      g.add(screen);
    }
    const bg=new THREE.Mesh(new THREE.PlaneGeometry(3.8,2.0),new THREE.MeshBasicMaterial({color:0x222222}));
    bg.name='SCREEN_BG'; bg.position.set(0,2.2,-4.92); g.add(bg);
    return g;
  }
  findSurfaces(){
    const layers=this.room.userData.layers||[];
    const seenScreens=new Set();
    this.room.traverse(o=>{
      let instance=o.parent;
      while(instance&&instance!==this.room&&instance.userData?.objectType!=='InstanceReference')instance=instance.parent;
      let layerIndex=o.userData.attributes?.layerIndex;
      if(instance&&instance!==this.room){
        if(layerIndex!==undefined)o.userData.sourceLayerIndex=layerIndex;
        layerIndex=instance.userData.attributes?.layerIndex;
        if(layerIndex!==undefined){
          o.userData.attributes={...o.userData.attributes,layerIndex};
          instance.userData.layerName=layers[layerIndex]?.name||'';
        }
      }
      const layer=layers[layerIndex];
      const layerPath=String(layer?.fullPath||layer?.path||layer?.name||o.userData.layerName||'');
      const layerName=layerPath.split(/::|[\\/]/).pop();
      o.userData.layerName=layerName;
      if(layerName==='Screen'&&o.isMesh){
        o.userData.role='information-screen';
        this.infoMesh=o;
      }
      else if(layerName==='Screens'&&instance&&instance!==this.room){
        instance.userData.layerName=layerName;
        instance.userData.role='small-screen';
        if(!seenScreens.has(instance)){
          seenScreens.add(instance);
          instance.name=instance.name||`SCREEN_${String(seenScreens.size).padStart(2,'0')}`;
          this.smallScreens.push(instance);
        }
      }
      else if(layerName==='Screens'&&o.isMesh){
        o.userData.role='small-screen';
        this.smallScreens.push(o);
      }
      else if(layerName==='Background')o.userData.role='background';
      else if(layerName==='Ground')o.userData.role='ground';
      else if(layerName==='Tables')o.userData.role='plinth';
      else o.userData.role='set-piece';
    });
    const saved=this.config.surfaces||{};
    Object.entries(saved).forEach(([name,type])=>{
      this.room.traverse(o=>{
        if(o.name!==name)return;
        if(type==='info'){
          this.infoMesh=o;
          o.userData.role='information-screen';
        }else{
          o.userData.role='small-screen';
          this.smallScreens.push(o);
        }
      });
    });
    this.roomMaterials={
      wall:new THREE.MeshStandardMaterial({color:0x3a3c40,roughness:.95,metalness:0,side:THREE.DoubleSide}),
      setPiece:new THREE.MeshStandardMaterial({color:0x6b6560,roughness:.92,metalness:0}),
      floor:new THREE.MeshStandardMaterial({color:0x4a4d52,roughness:.85,metalness:0,side:THREE.DoubleSide}),
      glass:new THREE.MeshStandardMaterial({
        color:0x777777,roughness:.35,metalness:0,transparent:true,opacity:.55,
        depthWrite:false,side:THREE.DoubleSide
      })
    };
    const replacedMaterials=new Set();
    this.room.traverse(mesh=>{
      if(!mesh.isMesh)return;
      let role=mesh.userData.role;
      for(let parent=mesh.parent;parent&&parent!==this.room;parent=parent.parent){
        if(parent.userData.role&&parent.userData.role!=='set-piece'){
          role=parent.userData.role;
          break;
        }
      }
      mesh.userData.role=role;
      const sourceMaterials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      sourceMaterials.forEach(material=>material&&replacedMaterials.add(material));
      const material=role==='ground'?this.roomMaterials.floor:
        role==='plinth'?this.roomMaterials.glass:
        role==='background'?this.roomMaterials.wall:this.roomMaterials.setPiece;
      mesh.material=Array.isArray(mesh.material)
        ?sourceMaterials.map(()=>material)
        :material;
      mesh.castShadow=false;
      mesh.receiveShadow=false;
    });
    replacedMaterials.forEach(material=>{
      Object.values(material).filter(value=>value?.isTexture).forEach(texture=>texture.dispose());
      material.dispose();
    });
  }
  positionForScreens(){
    const bounds=new THREE.Box3();
    this.smallScreens.forEach(screen=>{
      screen.updateWorldMatrix(true,true);
      bounds.expandByObject(screen);
    });
    if(bounds.isEmpty())throw new Error('No meshes were found on the Screens layer.');

    this.screenBounds=bounds.clone();
    if(!this.namedView)throw new Error('Could not find the selected Rhino named view.');
    const position=new THREE.Vector3(...this.namedView.position);
    const target=new THREE.Vector3(...this.namedView.target);
    const direction=target.clone().sub(position).normalize();
    this.camera.fov=this.namedView.fov;
    this.camera.position.copy(position);
    this.camera.up.copy(new THREE.Vector3(...this.namedView.up).normalize());
    this.camera.updateProjectionMatrix();
    this.roomBounds=new THREE.Box3().setFromObject(this.room);
    this.walkEyeHeight=position.y;
    this.camera.lookAt(target);
    this.walkYaw=Math.atan2(direction.x,-direction.z);
    this.walkPitch=Math.asin(THREE.MathUtils.clamp(direction.y,-1,1));
  }
  async initInfo(){
    if(!this.infoMesh)throw new Error('Could not find the Digital Archives::Screen mesh.');
    this.info=new InfoScreen(this.infoMesh,this.archives); await this.info.init(THREE);
  }
  async initMedia(){
    this.mediaIndex=await this.loadMediaIndex();
    this.assignmentImages=await this.loadAssignmentImages();
    const screens=this.smallScreens.flatMap(mediaSurfaces);
    screens.sort((a,b)=>{
      const order=new Map(this.config.smallScreens.map((config,index)=>[config.name,index]));
      return (order.get(a.userData.screenName||a.name)??Number.MAX_SAFE_INTEGER)-
        (order.get(b.userData.screenName||b.name)??Number.MAX_SAFE_INTEGER);
    });
    this.mediaScreens=screens.map(screen=>this.createScreenPlane(screen));
    this.mediaScreens.forEach((screen,i)=>{
      const screenName=screen.userData.screenName||screen.name;
      const screenConfig=this.config.smallScreens?.find(config=>config.name===screenName)||{};
      let item=this.resolveScreenItem(screenConfig,i);
      const archive=this.archives.find(row=>row.id===item?.archive_id);
      if(archive)item={...item,archive};
      const harvested=this.mediaIndex?.find(row=>row.archive===item?.archive_id||row.id===item?.archive_id);
      if(!item.src&&harvested?.file)item={...item,src:`./media/index/${harvested.file}`};
      if(!item.src&&this.assignmentImages.length){
        const picture=this.assignmentImages[i%this.assignmentImages.length];
        item={...item,type:'image',src:`./media/assignment4/${encodeURIComponent(picture.file)}`};
      }
      screen.userData.mediaIndex=i;
      const media=ScreenMedia.create(screen,item, this.renderer);
      this.media[i]=media;
    });
    const firstItem=this.media[0]?.item;
    this.info.focusItem(firstItem,this.getHour());
    this.info.draw();
    this.setMode(`Archive room · ${this.mediaScreens.length} screens`,`غرفة الأرشيف · ${arabicDigits(this.mediaScreens.length)} شاشات`);
  }
  async loadMediaIndex(){
    try{
      const response=await fetch('./media/index/index.json');
      if(!response.ok)return [];
      return await response.json();
    }catch(error){
      console.error('Could not load media/index/index.json:',error);
      return [];
    }
  }
  async loadAssignmentImages(){
    const response=await fetch('./media/assignment4/index.json');
    if(!response.ok)throw new Error(`Could not load Assignment 4 archive images (${response.status})`);
    const images=await response.json();
    if(!Array.isArray(images)||!images.length)throw new Error('Assignment 4 image index is empty.');
    return images;
  }
  updateArchiveBar(){
    const bar=document.querySelector('#archive-bar');
    if(!bar)return;
    const item=this.info?.item||this.media[0]?.item||{};
    const archive=this.info?.archiveFor(item)||this.archives.find(row=>row.id===item.archive_id)||{};
    const city=item.place||archive.city||'place not recorded';
    const year=item.date||[archive.start,archive.end].filter(Boolean).join('–')||'undated';
    const holder=item.held_by||archive.name||'holder unrecorded';
    const position=item.holder_pos||archive.pos||'';
    const positionAr=({RI:'داخل المنطقة · مستقل / مجتمعي',RS:'داخل المنطقة · حكومي / جامعي',OW:'خارج المنطقة · مؤسسة أجنبية',DI:'الشتات',EX:'منفى / ناشط'})[position]||'جهة الحفظ غير محددة';
    const online=archive.online||((archive.online_est&&Number(archive.online_est)>0)
      ?`${Number(archive.online_est).toLocaleString('en-GB')} items online`:'online access unconfirmed');
    const outside=this.archives.filter(row=>String(row.in_arab_world).toLowerCase()!=='true').length;
    const english=`${year} / ${archive.name||item.title||'Archive record'} [ ${city} ] / ${holder} (${position||'unrecorded'}) / ${online} | ${this.archives.length} archives / ${outside} outside the Arab world / ${this.edges.length} links`;
    const arabic=`${arabicDigits(year)} / ${archive.name_ar||item.title_ar||'سجل أرشيفي'} [ ${translatePlace(city)} ] / ${positionAr} / ${archive.online_est?arabicDigits(archive.online_est)+' متاح رقمياً':'الوصول الرقمي غير محدد'} | ${arabicDigits(this.archives.length)} أرشيف / ${arabicDigits(outside)} خارج العالم العربي / ${arabicDigits(this.edges.length)} رابط`;
    bar.querySelector('.bar-en').textContent=english;
    bar.querySelector('.bar-ar').textContent=arabic;
  }
  createScreenPlane(source){
    source.updateWorldMatrix(true,true);
    const localBounds=new THREE.Box3();
    source.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.geometry.attributes.position)return;
      const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(positions,i)
          .applyMatrix4(mesh.matrixWorld);
        localBounds.expandByPoint(source.worldToLocal(point));
      }
    });
    if(localBounds.isEmpty())throw new Error(`Could not measure screen object ${source.name}.`);
    const spans=localBounds.getSize(new THREE.Vector3());
    const center=localBounds.getCenter(new THREE.Vector3());
    const axes=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)];
    const sourceRotation=source.getWorldQuaternion(new THREE.Quaternion());
    const smallestAxis=[0,1,2].reduce((best,axis)=>spans.getComponent(axis)<spans.getComponent(best)?axis:best,0);
    const cameraDirection=this.camera.position.clone().sub(source.getWorldPosition(new THREE.Vector3())).normalize();
    const localNormal=axes[smallestAxis].clone();
    const worldDepthAxis=localNormal.clone().applyQuaternion(sourceRotation);
    if(worldDepthAxis.dot(cameraDirection)<0)localNormal.negate();
    const remaining=[0,1,2].filter(axis=>axis!==smallestAxis);
    const upAxis=remaining.reduce((best,axis)=>{
      const a=axes[axis].clone().applyQuaternion(sourceRotation);
      const b=axes[best].clone().applyQuaternion(sourceRotation);
      return Math.abs(a.y)>Math.abs(b.y)?axis:best;
    },remaining[0]);
    const widthAxis=remaining.find(axis=>axis!==upAxis);
    const localUp=axes[upAxis].clone();
    const worldUp=localUp.clone().applyQuaternion(sourceRotation);
    if(worldUp.y<0)localUp.negate();
    const localWidth=axes[widthAxis].clone();
    const worldWidth=localWidth.clone().applyQuaternion(sourceRotation);
    const desiredNormal=localNormal.clone().applyQuaternion(sourceRotation);
    let worldPlaneNormal=new THREE.Vector3().crossVectors(worldWidth,worldUp).normalize();
    if(worldPlaneNormal.dot(desiredNormal)<0){
      localWidth.negate();
      worldWidth.negate();
      worldPlaneNormal.negate();
    }
    const worldCenter=source.localToWorld(center.clone())
      .addScaledVector(desiredNormal,spans.getComponent(smallestAxis)*source.getWorldScale(new THREE.Vector3()).x*.5+.002);
    const roomRotation=this.room.getWorldQuaternion(new THREE.Quaternion());
    const roomInverse=roomRotation.clone().invert();
    const xAxis=worldWidth.clone().applyQuaternion(roomInverse);
    const yAxis=worldUp.clone().applyQuaternion(roomInverse);
    const normal=worldPlaneNormal.clone().applyQuaternion(roomInverse);
    const orientation=new THREE.Matrix4().makeBasis(xAxis,yAxis,normal);
    const localPosition=this.room.worldToLocal(worldCenter);
    const roomScale=this.room.getWorldScale(new THREE.Vector3());
    const sourceScale=source.getWorldScale(new THREE.Vector3());
    const width=spans.getComponent(widthAxis)*sourceScale.x*.88/roomScale.x;
    const height=spans.getComponent(upAxis)*sourceScale.y*.88/roomScale.y;
    const plane=new THREE.Mesh(
    new THREE.PlaneGeometry(width,height),
    new THREE.MeshBasicMaterial({
      color:0xffffff,
      side:THREE.DoubleSide,
      toneMapped:false,
      fog:false,
      polygonOffset:true,
      polygonOffsetFactor:-1,
      polygonOffsetUnits:-1
    })
    );
    plane.name=`${source.userData.screenName||source.name}_ScreenSlot`;
    plane.userData.role='screen-slot';
    plane.userData.screenName=source.userData.screenName||source.name;
    plane.userData.sourceObject=source;
    plane.position.copy(localPosition);
    plane.quaternion.setFromRotationMatrix(orientation);
    this.room.add(plane);
    plane.updateWorldMatrix(true,false);
    return plane;
  }
  configureScreenMaterials(){
    this.room.traverse(mesh=>{
      if(!mesh.isMesh)return;
      for(let parent=mesh.parent;parent&&parent!==this.room;parent=parent.parent){
        if(['small-screen','information-screen'].includes(parent.userData.role)){
          mesh.userData.role=parent.userData.role;
          break;
        }
      }
      if(!['small-screen','information-screen'].includes(mesh.userData.role))return;
      ensureUV(mesh.geometry);
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      materials.forEach(material=>{
        material.side=THREE.DoubleSide;
        material.toneMapped=false;
        material.polygonOffset=true;
        material.polygonOffsetFactor=-1;
        material.polygonOffsetUnits=-1;
        material.needsUpdate=true;
      });
    });
  }
  resolveScreenItem(screenConfig,index){
    const pool=this.config.pool||[];
    const pin=screenConfig.pin??screenConfig.item_id??screenConfig.item;
    if(pin!==null&&pin!==undefined&&pin!==''){
      if(typeof pin==='object')return pin;
      const match=pool.find(item=>[item.id,item.item_id,item.archive_id].includes(pin));
      if(match)return match;
      if(typeof pin==='number'&&pool[pin])return pool[pin];
    }
    const url=screenConfig.src||screenConfig.url;
    if(url){
      const type=screenConfig.type||(/\.(png|jpe?g|gif|webp)(?:[?#]|$)/i.test(url)?'image':'video');
      return {...screenConfig,type,src:url};
    }
    const item=pool[itemForSeat(index+(this.poolOffset||0),this.hour||12,pool.length||1)];
    if(item){
      const source=item.src||item.url||'';
      const type=item.type||(/\.(png|jpe?g|gif|webp)(?:[?#]|$)/i.test(source)?'image':source?'video':'absence');
      return {...item,type};
    }
    return {type:'absence',title:'NO SIGNAL'};
  }
  printLayerInventory(sourceLayers){
    const rows=sourceLayers.map(layer=>({
      layer:layer.name,
      objects:layer.objects,
      role:layer.name==='Background'?'backdrop':
        layer.name==='Screen'?'information screen':
        layer.name==='Screens'?'small media screens':
        layer.name==='Ground'?'floor':'set pieces'
    }));
    console.table(rows);
    const report=document.querySelector('#layer-report');
    report.hidden=false;
    report.textContent=rows.map(row=>`${row.layer}: ${row.objects} — ${row.role}`).join('\n');
    this.layerRows=rows;
  }
  setupLighting(){
    this.renderer.shadowMap.enabled=false;
    this.ambient=new THREE.HemisphereLight(0xffffff,0x44424a,.8);
    this.scene.add(this.ambient);
    const bounds=new THREE.Box3().setFromObject(this.room);
    const center=bounds.getCenter(new THREE.Vector3());
    const screenCenter=this.screenBounds.getCenter(new THREE.Vector3());
    const screenSize=this.screenBounds.getSize(new THREE.Vector3());
    const lightY=THREE.MathUtils.clamp(
      screenCenter.y+Math.max(1,screenSize.y*.25),
      bounds.min.y+.5,bounds.max.y-.5
    );
    const spreadX=Math.max(1,screenSize.x*.3);
    const spreadZ=Math.max(1,screenSize.z*.3);
    const lightPositions=[
      new THREE.Vector3(screenCenter.x-spreadX,lightY,screenCenter.z-spreadZ),
      new THREE.Vector3(screenCenter.x,lightY,screenCenter.z),
      new THREE.Vector3(screenCenter.x+spreadX,lightY,screenCenter.z+spreadZ)
    ];
    lightPositions.forEach(position=>{
      position.x=THREE.MathUtils.clamp(position.x,bounds.min.x+.5,bounds.max.x-.5);
      position.z=THREE.MathUtils.clamp(position.z,bounds.min.z+.5,bounds.max.z-.5);
    });
    this.softPoint=new THREE.PointLight(0x6f9e99,18,18,2);
    this.softPoint.position.copy(lightPositions[0]);
    this.scene.add(this.softPoint);
    this.pinkPoint=new THREE.PointLight(0xb77b94,18,18,2);
    this.pinkPoint.position.copy(lightPositions[1]);
    this.scene.add(this.pinkPoint);
    this.amberPoint=new THREE.PointLight(0xb99a78,18,18,2);
    this.amberPoint.position.copy(lightPositions[2]);
    this.scene.add(this.amberPoint);
    this.neonStrip=new THREE.Mesh(
      new THREE.BoxGeometry(.045,.035,bounds.getSize(new THREE.Vector3()).z*.72),
      new THREE.MeshStandardMaterial({
        color:0xb77b94,emissive:0xb77b94,emissiveIntensity:.55,
        roughness:.35,metalness:0
      })
    );
    this.neonStrip.position.set(bounds.min.x+.22,bounds.max.y-.42,center.z);
    this.scene.add(this.neonStrip);
  }
  async setupAtmosphere(){
    this.scene.background=null;
    this.scene.fog=null;
    this.clouds=[];
  }
  async startVideosOnArrival(){
    const jobs=[
      this.info.playVideo(),
      ...this.media.map(media=>media.play())
    ];
    const results=await Promise.allSettled(jobs);
    let blocked=false;
    results.forEach((result,index)=>{
      if(result.status==='rejected'){
        if(result.reason?.name==='NotAllowedError')blocked=true;
        else console.error('Could not start café media:',result.reason);
      }
    });
    if(blocked){
      this.onMediaGesture=()=>this.startVideosOnArrival();
      addEventListener('pointerdown',this.onMediaGesture,{once:true});
      addEventListener('keydown',this.onMediaGesture,{once:true});
    }
  }
  setupInput(){
    this.walkKeys=new Set();
    this.onWalkKeyDown=event=>{
      const key=event.key.toLowerCase();
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){
        event.preventDefault();
        this.walkKeys.add(key);
      }
    };
    this.onWalkKeyUp=event=>this.walkKeys.delete(event.key.toLowerCase());
    this.onLookStart=event=>{
      if(event.button!==0)return;
      event.preventDefault();
      this.lookPointer=event.pointerId;
      this.lookX=event.clientX;
      this.lookY=event.clientY;
      this.renderer.domElement.setPointerCapture(event.pointerId);
    };
    this.onLookMove=event=>{
      if(event.pointerId!==this.lookPointer)return;
      this.walkYaw-=(event.clientX-this.lookX)*.002;
      this.walkPitch=THREE.MathUtils.clamp(
        this.walkPitch-(event.clientY-this.lookY)*.002,-1.2,1.2
      );
      this.lookX=event.clientX;
      this.lookY=event.clientY;
    };
    this.onLookEnd=event=>{
      if(event.pointerId===this.lookPointer)this.lookPointer=null;
    };
    addEventListener('keydown',this.onWalkKeyDown);
    addEventListener('keyup',this.onWalkKeyUp);
    this.renderer.domElement.addEventListener('pointerdown',this.onLookStart);
    this.renderer.domElement.addEventListener('pointermove',this.onLookMove);
    this.renderer.domElement.addEventListener('pointerup',this.onLookEnd);
    this.renderer.domElement.addEventListener('pointercancel',this.onLookEnd);
  }
  handleWheel(deltaY){
    if(!this.ready||!this.roomBounds||!deltaY)return;
    const direction=Math.sign(deltaY);
    this.camera.position.x+=Math.sin(this.walkYaw)*direction*.2;
    this.camera.position.z-=Math.cos(this.walkYaw)*direction*.2;
    this.clampCameraToRoom();
  }
  clampCameraToRoom(){
    const margin=.3;
    this.camera.position.x=THREE.MathUtils.clamp(
      this.camera.position.x,this.roomBounds.min.x+margin,this.roomBounds.max.x-margin
    );
    this.camera.position.z=THREE.MathUtils.clamp(
      this.camera.position.z,this.roomBounds.min.z+margin,this.roomBounds.max.z-margin
    );
    this.camera.position.y=this.walkEyeHeight;
  }
  setupCurator(){
    const panel=document.querySelector('#curator'), status=document.querySelector('#curator-status'), text=document.querySelector('#curator-json');
    text.value=JSON.stringify(this.config.surfaces||{},null,2);
    this.onCuratorKey=e=>{
      if(e.key.toLowerCase()==='c'){
        this.curator=!this.curator; panel.classList.toggle('active',this.curator);
        status.textContent=this.curator?'Click a room surface to tag it.':'Curator mode off';
      }
    };
    addEventListener('keydown',this.onCuratorKey);
    document.querySelector('#save-surfaces').onclick=()=>{
      navigator.clipboard?.writeText(text.value).catch(()=>{});
      status.textContent='Surface assignments copied. Paste them into data/screens.json → surfaces.';
    };
  }
  tagSurface(mesh){
    const status=document.querySelector('#curator-status'), text=document.querySelector('#curator-json');
    const value=confirm('Tag this surface as the large background screen?')?'info':'small';
    const obj={}; try{Object.assign(obj,JSON.parse(text.value||'{}'));}catch{}
    obj[mesh.name||mesh.uuid]=value;
    text.value=JSON.stringify(obj,null,2);
    status.textContent=`Tagged ${mesh.name||mesh.uuid} as ${value}.`;
  }
  getHour(){
    const secondsPerHour=this.config.room?.day?.real_seconds_per_hour||60;
    const elapsed=Math.max(0,(performance.now()-this.clockStart)/1000);
    const openingHour=this.config.room?.day?.open_hour||9;
    return (openingHour+Math.floor(elapsed/secondsPerHour))%24;
  }
  update(dt){
    if(!this.ready){
      return;
    }
    this.clockElapsed=(this.clockElapsed||0)+dt;
    if(this.clockElapsed>=1){
      this.clockElapsed%=1;
      const clock=formatBilingualDateTime(new Date());
      const clockElement=document.querySelector('#cafe-clock');
      clockElement.querySelector('.time-en').textContent=clock.en;
      clockElement.querySelector('.time-ar').textContent=clock.ar;
    }
    if(this.info){
      this.info.update(dt);
    }
    this.screenCycleElapsed=(this.screenCycleElapsed||0)+dt;
    if(this.screenCycleElapsed>=12){
      this.screenCycleElapsed=0;
      this.reshuffleScreens(this.getHour());
    }
    this.updateScreenTransitions(dt);
    const moveX=Number(this.walkKeys.has('d')||this.walkKeys.has('arrowright'))-
      Number(this.walkKeys.has('a')||this.walkKeys.has('arrowleft'));
    const moveZ=Number(this.walkKeys.has('w')||this.walkKeys.has('arrowup'))-
      Number(this.walkKeys.has('s')||this.walkKeys.has('arrowdown'));
    if(moveX||moveZ){
      const length=Math.hypot(moveX,moveZ);
      const forwardX=Math.sin(this.walkYaw),forwardZ=-Math.cos(this.walkYaw);
      const rightX=Math.cos(this.walkYaw),rightZ=Math.sin(this.walkYaw);
      const distance=1.5*dt/length;
      this.camera.position.x+=(forwardX*moveZ+rightX*moveX)*distance;
      this.camera.position.z+=(forwardZ*moveZ+rightZ*moveX)*distance;
      this.clampCameraToRoom();
    }
    this.camera.position.y=this.walkEyeHeight;
    this.camera.lookAt(this.camera.position.clone().add(new THREE.Vector3(
      Math.sin(this.walkYaw)*Math.cos(this.walkPitch),
      Math.sin(this.walkPitch),
      -Math.cos(this.walkYaw)*Math.cos(this.walkPitch)
    )));
  }
  reshuffleScreens(hour){
    if(this.reshuffling||this.screenTransitions?.length)return;
    this.reshuffling=true;
    const pool=this.config.pool||[];
    this.poolOffset=((this.poolOffset||0)+1)%Math.max(1,pool.length);
    for(let offset=0;offset<this.mediaScreens.length;offset++){
      const index=(this.nextScreenToShuffle+offset)%this.mediaScreens.length;
      const screen=this.mediaScreens[index];
      const name=screen.userData.screenName||screen.name;
      const config=this.config.smallScreens?.find(row=>row.name===name)||{};
      const pinned=config.pin??config.item_id??config.item;
      if(pinned!==null&&pinned!==undefined&&pinned!=='')continue;
      let item=this.resolveScreenItem(config,index);
      const archive=this.archives.find(row=>row.id===item?.archive_id);
      if(archive)item={...item,archive};
      const harvested=this.mediaIndex?.find(row=>row.archive===item?.archive_id||row.id===item?.archive_id);
      if(!item.src&&harvested?.file)item={...item,src:`./media/index/${harvested.file}`};
      if(!item.src&&this.assignmentImages.length){
        const picture=this.assignmentImages[(index+(this.poolOffset||0))%this.assignmentImages.length];
        item={...item,type:'image',src:`./media/assignment4/${encodeURIComponent(picture.file)}`};
      }
      this.screenTransitions=this.screenTransitions||[];
      this.screenTransitions.push({index,item,elapsed:0,stage:'out'});
      this.nextScreenToShuffle=(index+1)%this.mediaScreens.length;
      break;
    }
    this.reshuffling=false;
  }
  updateScreenTransitions(dt){
    if(!this.screenTransitions?.length)return;
    this.screenTransitions=this.screenTransitions.filter(transition=>{
      transition.elapsed+=dt;
      const amount=Math.min(1,transition.elapsed/.24);
      if(transition.stage==='out'){
        this.media[transition.index]?.setOpacity(1-amount);
        if(amount<1)return true;
        this.media[transition.index]?.dispose();
        const screen=this.mediaScreens[transition.index];
        const media=ScreenMedia.create(screen,transition.item,this.renderer);
        this.media[transition.index]=media;
        media.setOpacity(0);
        media.play().catch(error=>console.error(`Could not load media for ${screen.name}:`,error));
        transition.stage='in';
        transition.elapsed=0;
        return true;
      }
      const alpha=Math.min(1,transition.elapsed/.3);
      this.media[transition.index]?.setOpacity(alpha);
      return alpha<1;
    });
  }
  dispose(){
    if(this.onWalkKeyDown)removeEventListener('keydown',this.onWalkKeyDown);
    if(this.onWalkKeyUp)removeEventListener('keyup',this.onWalkKeyUp);
    if(this.onLookStart)this.renderer.domElement.removeEventListener('pointerdown',this.onLookStart);
    if(this.onLookMove)this.renderer.domElement.removeEventListener('pointermove',this.onLookMove);
    if(this.onLookEnd){
      this.renderer.domElement.removeEventListener('pointerup',this.onLookEnd);
      this.renderer.domElement.removeEventListener('pointercancel',this.onLookEnd);
    }
    if(this.onMediaGesture){
      removeEventListener('pointerdown',this.onMediaGesture);
      removeEventListener('keydown',this.onMediaGesture);
    }
    if(this.onCuratorKey)removeEventListener('keydown',this.onCuratorKey);
    this.media.forEach(media=>media.dispose());
    this.info?.dispose();
    this.scene.remove(this.ambient,this.softPoint,this.pinkPoint,this.amberPoint,this.neonStrip);
    this.neonStrip?.geometry.dispose();
    this.neonStrip?.material.dispose();
    this.clouds?.forEach(cloud=>{
      this.scene.remove(cloud);
      cloud.geometry.dispose();
      cloud.material.dispose();
    });
    const geometries=new Set(),materials=new Set(),textures=new Set();
    this.room?.traverse(object=>{
      if(object.geometry)geometries.add(object.geometry);
      const list=Array.isArray(object.material)?object.material:[object.material];
      list.filter(Boolean).forEach(material=>materials.add(material));
    });
    materials.forEach(material=>{
      Object.values(material).filter(value=>value?.isTexture).forEach(texture=>textures.add(texture));
      material.dispose();
    });
    textures.forEach(texture=>texture.dispose());
    geometries.forEach(geometry=>geometry.dispose());
  }
}
