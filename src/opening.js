import * as THREE from 'three';
import { ABJAD } from './zairja.js';
import { arabicArchiveDate, arabicDigits, translateMedia, translatePlace } from './bilingual.js?v=2';
import { formatBilingualDateTime } from './time.js?v=2';
const INK='#111619';
const PAPER='#ffffff';
const SCENE_GROUPS=[
  {en:'Archives carry how a place is seen, and by whom.',ar:'تحمل الأرشيفات كيف يُرى المكان، ومن يراه.'},
  {en:'INFORMATION',ar:'المعلومات'},
  {en:'ARCHIVE IMAGES',ar:'صور الأرشيف'},
  {en:'CAFÉ',ar:'المقهى'}
];
const ARAB_COUNTRY_IDS=new Set([
  '012','048','174','262','818','368','400','414','422','434','478','504',
  '512','275','634','682','706','729','760','788','784','887'
]);
const HOLDER_COLORS={RI:'#78928b',RS:'#9a8f74',OW:'#718397',DI:'#7a8790',EX:'#927d87'};
const HOLDER_LABELS={
  RI:['In-region independent / community','داخل المنطقة · مستقل / مجتمعي'],
  RS:['In-region state / university','داخل المنطقة · حكومي / جامعي'],
  OW:['Outside · foreign institution','خارج المنطقة · مؤسسة أجنبية'],
  DI:['Diaspora · community or museum','الشتات · مجتمع أو متحف'],
  EX:['Exile · activist / born-digital','منفى · ناشط / رقمي']
};
const CITY_LABELS={
  Beirut:'بيروت',Damascus:'دمشق',Birzeit:'بيرزيت',Cairo:'القاهرة',
  Baghdad:'بغداد',Doha:'الدوحة','Abu Dhabi':'أبو ظبي',
  'New York / Little Syria':'نيويورك / سوريا الصغيرة'
};
const CONTINENTS=[
  [[-168,70],[-140,72],[-122,58],[-112,50],[-124,32],[-106,20],[-98,16],[-84,10],[-78,22],[-65,45],[-52,55],[-80,68],[-115,74]],
  [[-82,12],[-70,8],[-60,-3],[-50,-12],[-47,-25],[-58,-55],[-72,-50],[-78,-25]],
  [[-18,36],[2,38],[28,32],[44,12],[39,-10],[30,-34],[17,-35],[5,-20],[-2,5],[-15,18]],
  [[-10,36],[-8,55],[8,70],[36,70],[60,55],[90,72],[125,60],[155,55],[170,48],[148,35],[125,22],[108,8],[96,8],[78,20],[60,25],[44,38],[30,35],[20,45],[8,36]],
  [[44,30],[58,30],[62,17],[54,12],[45,15]],
  [[112,-12],[132,-10],[153,-25],[145,-40],[120,-35]]
];

export class Opening {
  constructor({scene,camera,renderer}) {
    this.scene=scene;this.camera=camera;this.renderer=renderer;
    this.current=0;this.done=false;this.progress=0;
    this.targetRideProgress=0;this.pendingRideProgress=0;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  async init() {
    await Promise.all([
      document.fonts.load('400 18px "IBM Plex Sans Arabic"'),
      document.fonts.load('400 18px Amiri')
    ]);
    this.scene.background=null;
    document.body.classList.remove('cafe-mode','opening-later');
    this.camera.position.set(0,0,16);
    this.camera.up.set(0,1,0);this.camera.lookAt(0,0,0);
    this.cards=document.querySelector('#opening-cards');
    this.cards.replaceChildren();
    this.cards.style.opacity='1';
    document.querySelector('#room-nav').style.display='none';
    document.querySelector('#cafe-hud').classList.remove('visible');
    const mode=document.querySelector('#mode-label');
    mode.querySelector('.mode-en').textContent='Scroll to enter';
    mode.querySelector('.mode-ar').textContent='مرّر للدخول';
    this.skip=document.querySelector('#skip');
    this.skip.style.display='block';
    this.skip.onclick=()=>this.jumpToScene(3);
    this.onKey=e=>{
      if(['ArrowDown',' ','PageDown'].includes(e.key)){
        e.preventDefault();this.advanceRide(.03);
      }else if(['ArrowUp','PageUp'].includes(e.key)){
        e.preventDefault();
      }else if(e.key==='Escape')this.jumpToScene(3);
    };
    this.onKeyCapture=e=>{
      if(!['ArrowDown','ArrowUp',' ','PageDown','PageUp'].includes(e.key))return;
      if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
      e.preventDefault();
    };
    addEventListener('keydown',this.onKeyCapture,true);
    addEventListener('keydown',this.onKey);
    this.touchY=null;
    this.onTouchStart=e=>{this.touchY=e.touches[0].clientY;};
    this.onTouchEnd=e=>{
      if(this.touchY!==null&&Math.abs(this.touchY-e.changedTouches[0].clientY)>35)
        this.advanceRide(Math.max(0,(this.touchY-e.changedTouches[0].clientY)*.0025));
      this.touchY=null;
    };
    addEventListener('touchstart',this.onTouchStart,{passive:true});
    addEventListener('touchend',this.onTouchEnd,{passive:true});
    this.rows=await this.loadArchives();
    this.edges=await this.loadEdges();
    this.records=this.rows;
    this.outsideCount=this.records.filter(row=>String(row.in_arab_world).toLowerCase()!=='true').length;
    this.syriaOutsideCount=new Set(this.records.filter(row=>
      row.depicts?.split(';').includes('Syria')&&row.country!=='Syria'
    ).map(row=>row.city)).size;
    this.captions=SCENE_GROUPS.map((row,index)=>index===0?this.createCaption(row,index):null);
    this.layers=[];
    for(let i=0;i<4;i++)this.layers.push(this.createLayer(i));
    await this.createGlobe(this.layers[0]);
    this.ringScale=1;
    this.setLayerOpacity(0,1);
    this.createInformationBlocks(this.layers[1]);
    await this.createAssignmentImages(this.layers[2]);
    this.createCameraStops();
    this.stopIndex=0;
    this.current=0;
    this.progress=0;
    this.targetRideProgress=this.pendingRideProgress;
    this.pendingRideProgress=0;
    this.networkBar=document.querySelector('#opening-network');
    this.updateNetworkBar();
    this.setCaption(0);
    this.continueButton=document.querySelector('#continue-ride');
    if(this.continueButton)this.continueButton.remove();
  }
  createCaption(row,index) {
    const entry=document.createElement('section');
    entry.className=`opening-entry scene-${index+1}`;
    entry.setAttribute('aria-hidden','true');
    const english=document.createElement('div');
    english.className='group-heading';
    if(index===0){
      const year=document.createElement('strong');
      year.textContent='2026';
      english.append(year,document.createTextNode(` / ${row.en}`));
    }else english.textContent=row.en;
    const arabic=document.createElement('div');
    arabic.className='group-heading-ar';arabic.lang='ar';arabic.dir='rtl';arabic.textContent=row.ar;
    entry.append(english,arabic);
    const list=document.createElement('div');
    list.className='opening-records';
    entry.appendChild(list);
    entry._lines=this.sceneLines(index);
    entry._page=0;
    this.renderCaptionPage(entry,0);
    this.cards.appendChild(entry);
    return entry;
  }
  renderCaptionPage(entry,page) {
    const list=entry.querySelector('.opening-records');
    const lines=entry._lines||[];
    const pageSize=entry.classList.contains('scene-1')?4:3;
    const pageCount=Math.max(1,Math.ceil(lines.length/pageSize));
    const start=(page%pageCount)*pageSize;
    list.replaceChildren();
    lines.slice(start,start+pageSize).forEach(([enText,arText])=>{
      const line=document.createElement('div');
      line.className='archive-line';
      const en=document.createElement('div');
      en.className='record-en';
      en.textContent=enText;
      const ar=document.createElement('div');
      ar.className='record-ar';ar.lang='ar';ar.dir='rtl';ar.textContent=arText;
      line.append(en,ar);
      list.appendChild(line);
    });
    entry._page=page;
  }
  sceneLines(index) {
    if(index===0){
      const damascus=this.records.find(record=>/damascus/i.test(record.city||''));
      return [
        [`${this.records.length} archive sites`,`${arabicDigits(this.records.length)} موقعاً أرشيفياً`],
        [`${this.outsideCount} outside the Arab world`,`${arabicDigits(this.outsideCount)} خارج العالم العربي`],
        [`${damascus?.start||'1550'} / Damascus`,`${arabicArchiveDate(damascus?.start||'1550')} / دمشق`],
        [`${this.edges.length} documented links`,`${arabicDigits(this.edges.length)} رابط موثق`]
      ];
    }
    if(index===1){
      return [...this.records]
        .sort((a,b)=>this.startYear(a)-this.startYear(b))
        .map(row=>this.archiveLine(row));
    }
    if(index===2){
      const counts=new Map();
      this.records.forEach(row=>counts.set(row.pos,(counts.get(row.pos)||0)+1));
      return [...counts.entries()].map(([position,count])=>{
        const [label,labelAr]=HOLDER_LABELS[position]||[position||'Unclassified','غير مصنف'];
        return [
          `${arabicDigits(count)} / ${label}`,
          `${arabicDigits(count)} / ${labelAr}`
        ];
      });
    }
    if(index===3){
      const movements=this.edges.filter(edge=>['custody','migration'].includes(edge.type));
      const lines=movements.map(edge=>{
        const dates=[edge.start,edge.end].filter(Boolean).join('–')||'dates not recorded';
        const source=this.records.find(record=>record.id===edge.source);
        const target=this.records.find(record=>record.id===edge.target);
        const en=`${dates} / ${edge.source_name} → ${edge.target_name} / ${edge.type} / ${edge.note||''}`;
        const ar=`${arabicArchiveDate(dates)} / ${source?.name_ar||edge.source_name} ← ${target?.name_ar||edge.target_name} / ${edge.type==='migration'?'هجرة':'حيازة'}`;
        return [en,ar];
      });
      const uncounted=this.records.filter(row=>!row.online_est);
      lines.unshift([
        `NO SIGNAL / ${uncounted.length} archives have no online item count recorded`,
        `لا توجد أعداد للمواد المتاحة رقمياً في ${arabicDigits(uncounted.length)} أرشيفاً`
      ]);
      const unavailable=this.records.filter(row=>/not online|onsite only|offline|no online/i.test(`${row.access} ${row.online}`));
      lines.push(...unavailable.map(row=>this.archiveLine(row)));
      return lines;
    }
    if(index===4){
      return [[
        '28 archival photographs / MENA people arriving in the United States',
        '٢٨ صورة أرشيفية / مهاجرون من الشرق الأوسط وشمال أفريقيا إلى الولايات المتحدة'
      ]];
    }
    return [
      ['47 archives / 25 outside the Arab world / 191 documented links',
        `${arabicDigits(this.records.length)} أرشيف / ${arabicDigits(this.outsideCount)} خارج العالم العربي / ${arabicDigits(this.edges.length)} رابط موثق`],
      ['The camera continues straight into the café.',
        'تتابع الكاميرا طريقها المستقيم إلى المقهى.']
    ];
  }
  archiveLine(row) {
    const year=[row.start,row.end].filter(Boolean).join('–')||'undated';
    const name=row.name||row.id||'Archive record';
    const city=row.city||'place not recorded';
    const media=(row.media||'archive').split(';')[0];
    const position=HOLDER_LABELS[row.pos]||[row.pos||'Unclassified','غير مصنف'];
    const holdings=row.holdings||'holdings not recorded';
    const online=row.online_est
      ?`${Number(row.online_est).toLocaleString('en-GB')} items online / ${row.online||'count recorded'}`
      :row.online||'online count unrecorded';
    const arabicOnline=row.online_est?`${arabicDigits(Number(row.online_est))} مادة متاحة رقمياً`:'عدد المواد المتاحة رقمياً غير مسجل';
    return [
      `${year} / ${name} [ ${city} ] / ${media} / ${position[0]} / ${holdings} / ${online}`,
      `${arabicArchiveDate(year)} / ${row.name_ar||name} [ ${translatePlace(city)} ] / ${translateMedia(media)} / ${position[1]} / ${row.holdings_ar||'المقتنيات'} / ${arabicOnline}`
    ];
  }
  startYear(record) {
    const year=String(record.start||'').match(/\d{3,4}/)?.[0];
    return year?Number(year):Number.POSITIVE_INFINITY;
  }
  parseCsv(text) {
    const lines=text.trim().split(/\r?\n/),headers=this.parseLine(lines.shift());
    return lines.filter(Boolean).map(line=>{
      const values=this.parseLine(line);
      return Object.fromEntries(headers.map((header,i)=>[header,values[i]||'']));
    });
  }
  parseLine(line) {
    const out=[];let value='',quoted=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
      else if(ch===','&&!quoted){out.push(value);value='';}
      else value+=ch;
    }
    out.push(value);return out;
  }
  async loadArchives() {
    const response=await fetch('./data/archives.csv');
    if(!response.ok)throw new Error(`Could not load opening archive data (${response.status})`);
    return this.parseCsv(await response.text());
  }
  async loadEdges(){
    const response=await fetch('./data/edges.csv');
    if(!response.ok)throw new Error(`Could not load opening network data (${response.status})`);
    return this.parseCsv(await response.text());
  }
  createLayer(index) {
    const layer=new THREE.Group();
    layer.position.z=[0,-16,-64,-96][index];
    layer.userData={index,art:null,clouds:[],fadeMaterials:[]};
    this.scene.add(layer);
    if(index===0)this.createZairja(layer);
    return layer;
  }
  createInformationBlocks(layer) {
    const holderCounts=new Map();
    this.records.forEach(row=>holderCounts.set(row.pos,(holderCounts.get(row.pos)||0)+1));
    const holders=[...holderCounts.entries()].map(([position,count])=>{
      const [label,labelAr]=HOLDER_LABELS[position]||[position||'Unclassified','غير مصنف'];
      return [`${count} / ${label}`,`${arabicDigits(count)} / ${labelAr}`];
    });
    const movements=this.edges.filter(edge=>['custody','migration'].includes(edge.type)).map(edge=>{
      const dates=[edge.start,edge.end].filter(Boolean).join('–')||'dates not recorded';
      const source=this.records.find(record=>record.id===edge.source);
      const target=this.records.find(record=>record.id===edge.target);
      return [
        `${dates} / ${edge.source_name} → ${edge.target_name} / ${edge.type} / ${edge.note||''}`,
        `${arabicArchiveDate(dates)} / ${source?.name_ar||edge.source_name} ← ${target?.name_ar||edge.target_name} / ${edge.type==='migration'?'هجرة':'حيازة'}`
      ];
    });
    const missing=this.records.filter(row=>
      !row.online_est||/not online|onsite only|offline|no online/i.test(`${row.access} ${row.online}`)
    );
    const sections=[
      {en:'THE REGION',ar:'المنطقة',lines:this.records.map(row=>this.archiveLine(row))},
      {en:'DATES',ar:'التواريخ',lines:[...this.records]
        .sort((a,b)=>this.startYear(a)-this.startYear(b)).map(row=>this.archiveLine(row))},
      {en:'WHO HOLDS IT',ar:'من يحتفظ بها',lines:holders},
      {en:'CUSTODY MOVES & MIGRATION',ar:'تحركات الحيازة والهجرة',lines:movements},
      {en:'NO SIGNAL',ar:'لا توجد إشارة',lines:missing.map(row=>this.archiveLine(row))}
    ];
    const positions=[-20,-25,-30,-35,-40];
    this.informationBlocks=sections.map((section,index)=>{
      const canvas=document.createElement('canvas');
      canvas.width=1024;canvas.height=420;
      const texture=new THREE.CanvasTexture(canvas);
      texture.colorSpace=THREE.SRGBColorSpace;
      const mesh=new THREE.Mesh(
        new THREE.PlaneGeometry(7.2,3.3),
        new THREE.MeshBasicMaterial({
          map:texture,transparent:true,side:THREE.DoubleSide,
          toneMapped:false,depthWrite:false
        })
      );
      mesh.position.set(index%2===0?-.8:.8,.15,positions[index]);
      mesh.visible=false;
      layer.add(mesh);
      const block={...section,canvas,texture,mesh,page:0,elapsed:0};
      this.drawInformationPage(block);
      return block;
    });
  }
  createCameraStops() {
    this.infoStart=1;
    this.imagesStart=this.infoStart+this.informationBlocks.length;
    this.cafeStop=this.imagesStart+this.galleryGroups.length;
    this.cameraStops=[new THREE.Vector3(0,0,16)];
    this.informationBlocks.forEach(block=>{
      this.cameraStops.push(new THREE.Vector3(
        0,0,this.layers[1].position.z+block.mesh.position.z+8
      ));
    });
    this.galleryGroups.forEach(group=>{
      group.group.position.x=0;
      group.group.position.y=0;
      this.cameraStops.push(new THREE.Vector3(
        0,0,this.layers[2].position.z+group.group.position.z+8.8
      ));
    });
    this.cameraStops.push(new THREE.Vector3(-629.3846,19.3622,-846.1495));
    this.cameraStopCount=this.cameraStops.length;
    this.camera.position.copy(this.cameraStops[0]);
    this.camera.up.set(0,1,0);
    this.camera.lookAt(0,0,0);
  }
  drawInformationPage(block) {
    const ctx=block.canvas.getContext('2d');
    ctx.clearRect(0,0,block.canvas.width,block.canvas.height);
    ctx.fillStyle='rgba(255,255,255,.92)';
    ctx.textBaseline='middle';
    const alignRight=block.mesh.position.x<0;
    const anchor=alignRight?992:32;
    ctx.textAlign=alignRight?'right':'left';
    ctx.direction='ltr';
    ctx.font='600 14px "Times New Roman",serif';
    ctx.fillText(block.en,anchor,36);
    ctx.direction='rtl';
    ctx.font='400 14px "IBM Plex Sans Arabic",Amiri,serif';
    ctx.fillText(block.ar,anchor,70);
    const pageSize=3;
    const pageCount=Math.max(1,Math.ceil(block.lines.length/pageSize));
    const start=(block.page%pageCount)*pageSize;
    block.lines.slice(start,start+pageSize).forEach(([en,ar],index)=>{
      const y=132+index*92;
      ctx.textAlign=alignRight?'right':'left';
      ctx.direction='ltr';
      ctx.font='400 12px "Times New Roman",serif';
      ctx.fillText(en,anchor,y,960);
      ctx.textAlign=alignRight?'right':'left';
      ctx.direction='rtl';
      ctx.font='400 12px "IBM Plex Sans Arabic",Amiri,serif';
      ctx.fillText(ar,anchor,y+34,960);
    });
    block.texture.needsUpdate=true;
  }
  async createGlobe(layer) {
    if(!window.d3?.geoEquirectangular||!window.topojson?.feature)
      throw new Error('Locally vendored D3 or TopoJSON did not load.');
    const response=await fetch('./lib/vendor/countries-50m.json');
    if(!response.ok)throw new Error(`Could not load vendored world map (${response.status})`);
    const world=await response.json();
    const features=window.topojson.feature(world,world.objects.countries).features;
    const boundaries=window.topojson.mesh(world,world.objects.countries,(a,b)=>a!==b);
    const canvas=document.createElement('canvas');
    canvas.width=1024;canvas.height=512;
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const projection=window.d3.geoEquirectangular()
      .scale(canvas.width/(2*Math.PI))
      .translate([canvas.width/2,canvas.height/2]);
    const path=window.d3.geoPath(projection,ctx);
    const graticule=window.d3.geoGraticule10();
    ctx.beginPath();path(graticule);
    ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=.8;ctx.stroke();
    features.forEach(feature=>{
      if(!ARAB_COUNTRY_IDS.has(String(feature.id).padStart(3,'0')))return;
      ctx.beginPath();path(feature);
      ctx.fillStyle='rgba(108,128,120,.42)';
      ctx.fill();
    });
    ctx.beginPath();path(boundaries);
    ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=.9;ctx.stroke();
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
    const globe=new THREE.Group();
    this.globeRadius=2.45;
    globe.position.set(0,0,-1.25);
    globe.rotation.y=0;
    globe.userData.targetRotation=THREE.MathUtils.degToRad(-47);
    const sphereMaterial=new THREE.ShaderMaterial({
      uniforms:{map:{value:texture}},
      vertexShader:`
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vView;
        void main(){
          vUv=uv;
          vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
          vNormalView=normalize(normalMatrix*normal);
          vView=normalize(-mvPosition.xyz);
          gl_Position=projectionMatrix*mvPosition;
        }
      `,
      fragmentShader:`
        uniform sampler2D map;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vView;
        void main(){
          vec4 ink=texture2D(map,vUv);
          gl_FragColor=vec4(ink.rgb,ink.a);
        }
      `,
      side:THREE.FrontSide,
      transparent:true,
      depthWrite:false,
      toneMapped:false
    });
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(this.globeRadius,96,64),sphereMaterial));
    const markerGeometry=new THREE.SphereGeometry(.032,10,8);
    this.records.forEach(record=>{
      const latitude=Number(record.lat),longitude=Number(record.lon);
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return;
      const point=this.globePoint(latitude,longitude,this.globeRadius+.025);
      const marker=new THREE.Mesh(markerGeometry,new THREE.MeshBasicMaterial({
        color:HOLDER_COLORS[record.pos]||'#7c8588',toneMapped:false
      }));
      marker.position.copy(point);
      marker.userData.archive=record.id;
      globe.add(marker);
    });
    const labels=[
      ['Beirut','Beirut',[-.65,.42,.08]],['Damascus','Damascus',[.65,.48,.08]],
      ['Birzeit','Birzeit',[-.78,-.02,.08]],['Cairo','Cairo',[-.8,-.5,.08]],
      ['Baghdad','Baghdad',[.75,-.34,.08]],['Doha','Doha',[.8,.16,.08]],
      ['Abu Dhabi','Abu Dhabi',[.9,-.72,.08]],
      ['Little Syria','New York / Little Syria',[0,-.98,.08]]
    ];
    labels.forEach(([match,label,offset])=>{
      const record=this.records.find(item=>
        item.city?.toLowerCase().includes(match.toLowerCase())||
        item.name?.toLowerCase().includes(match.toLowerCase())
      );
      if(!record)return;
      const point=this.globePoint(Number(record.lat),Number(record.lon),this.globeRadius+.07);
      const labelPosition=point.clone().add(new THREE.Vector3(...offset));
      const text=this.makeGlobeLabel(label,CITY_LABELS[label]||CITY_LABELS[match]||'');
      text.position.copy(labelPosition);
      text.scale.set(1.05,.2,1);
      globe.add(text);
    });
    layer.add(globe);
    this.globe=globe;
  }
  globePoint(latitude,longitude,radius) {
    const lat=THREE.MathUtils.degToRad(latitude);
    const lon=THREE.MathUtils.degToRad(longitude);
    return new THREE.Vector3(
      Math.cos(lat)*Math.cos(lon)*radius,
      Math.sin(lat)*radius,
      Math.cos(lat)*Math.sin(lon)*radius
    );
  }
  makeGlobeLabel(english,arabic) {
    const canvas=document.createElement('canvas');
    canvas.width=640;canvas.height=112;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='rgba(17,22,25,.94)';
    ctx.textBaseline='top';ctx.textAlign='left';
    ctx.font='25px "Times New Roman",serif';
    ctx.fillText(english,5,4,620);
    ctx.direction='rtl';ctx.textAlign='right';
    ctx.font='25px Amiri,"IBM Plex Sans Arabic",serif';
    ctx.fillText(arabic,635,52,620);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({
      map:texture,transparent:true,depthWrite:false,toneMapped:false
    }));
    sprite.scale.set(1.45,.26,1);
    return sprite;
  }
  async createAssignmentImages(layer){
    const [openingResponse,assignmentResponse]=await Promise.all([
      fetch('./media/index/index.json'),
      fetch('./media/assignment4/index.json')
    ]);
    if(!openingResponse.ok)throw new Error(`Could not load archive image index (${openingResponse.status})`);
    if(!assignmentResponse.ok)throw new Error(`Could not load Assignment 4 image index (${assignmentResponse.status})`);
    const openingEntries=await openingResponse.json();
    const assignmentEntries=await assignmentResponse.json();
    if(!Array.isArray(openingEntries)||!Array.isArray(assignmentEntries))
      throw new Error('An archive image index is not a list.');
    if(!assignmentEntries.length)throw new Error('Assignment 4 image index is empty.');
    this.assignmentImages=assignmentEntries;
    const entries=[
      ...openingEntries.map(entry=>({...entry,directory:'index'})),
      ...assignmentEntries.map(entry=>({...entry,directory:'assignment4'}))
    ];
    this.galleryGroups=[];
    const glass=new THREE.MeshStandardMaterial({
      color:0xd9e1e3,roughness:.2,metalness:0,transparent:true,opacity:.38
    });
    const panelCanvas=document.createElement('canvas');
    panelCanvas.width=256;panelCanvas.height=256;
    const panelContext=panelCanvas.getContext('2d');
    panelContext.fillStyle='#b8b6b0';
    panelContext.fillRect(0,0,256,256);
    panelContext.fillStyle='rgba(255,255,255,.025)';
    for(let y=0;y<256;y+=4)panelContext.fillRect(0,y,256,1);
    const panelTexture=new THREE.CanvasTexture(panelCanvas);
    panelTexture.colorSpace=THREE.SRGBColorSpace;
    await Promise.all(entries.map(async(entry,index)=>{
      const image=new Image();
      image.decoding='async';
      await new Promise((resolve,reject)=>{
        image.onload=resolve;
        image.onerror=()=>reject(new Error(`Could not load archive image: ${entry.file}`));
        image.src=`./media/${entry.directory}/${encodeURIComponent(entry.file)}`;
      });
      const resize=Math.min(1,1024/Math.max(image.naturalWidth,image.naturalHeight));
      const bitmap=await createImageBitmap(image,{
        imageOrientation:'flipY',
        resizeWidth:Math.max(1,Math.round(image.naturalWidth*resize)),
        resizeHeight:Math.max(1,Math.round(image.naturalHeight*resize)),
        resizeQuality:'high'
      });
      const texture=new THREE.Texture(bitmap);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.minFilter=THREE.LinearFilter;
      texture.flipY=false;
      texture.needsUpdate=true;
      const groupIndex=Math.floor(index/6),slot=index%6;
      let vignette=this.galleryGroups[groupIndex];
      if(!vignette){
        const baseZ=-8-groupIndex*7;
        const group=new THREE.Group();
        group.position.z=baseZ;
        group.userData.baseZ=baseZ;
        const backing=new THREE.Mesh(
          new THREE.PlaneGeometry(9,5.4),
          new THREE.MeshBasicMaterial({map:panelTexture,color:0xffffff,toneMapped:false})
        );
        backing.position.set(0,.15,-.65);
        group.add(backing);
        const ground=new THREE.Mesh(
          new THREE.PlaneGeometry(10,6),
          new THREE.MeshStandardMaterial({color:0x777d80,roughness:1,metalness:0})
        );
        ground.rotation.x=-Math.PI/2;
        ground.position.set(0,-2.85,0);
        group.add(ground);
        const labelCanvas=document.createElement('canvas');
        labelCanvas.width=1024;labelCanvas.height=72;
        const labelContext=labelCanvas.getContext('2d');
        labelContext.fillStyle='#f0f2f3';
        labelContext.font='30px "Times New Roman",serif';
        labelContext.textAlign='center';labelContext.textBaseline='middle';
        const labelEntry=entries[groupIndex*6];
        labelContext.fillText(`${labelEntry.name} / ${labelEntry.date||'undated'}`,512,36,1000);
        const labelTexture=new THREE.CanvasTexture(labelCanvas);
        labelTexture.colorSpace=THREE.SRGBColorSpace;
        const label=new THREE.Mesh(
          new THREE.PlaneGeometry(5.2,.36),
          new THREE.MeshBasicMaterial({map:labelTexture,transparent:true,side:THREE.DoubleSide,toneMapped:false,depthWrite:false})
        );
        label.position.set(0,-2.45,4.7);
        group.add(label);
        const photos=new THREE.Group();
        const stands=new THREE.Group();
        group.add(photos,stands);
        layer.add(group);
        vignette={group,photos,stands,label,labelTexture,index:groupIndex};
        this.galleryGroups[groupIndex]=vignette;
      }
      const column=slot%3,row=Math.floor(slot/3);
      const fit=Math.min(2.35/bitmap.width,1.55/bitmap.height);
      const width=bitmap.width*fit;
      const height=bitmap.height*fit;
      const photo=new THREE.Mesh(
        new THREE.PlaneGeometry(width,height),
        new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false,depthWrite:false})
      );
      photo.userData.imageBitmap=bitmap;
      photo.position.set((column-1)*2.65,row===0?.8:-.8,.05);
      vignette.photos.add(photo);
      const standHeight=[.35,.55,.75][(index+1)%3];
      const stand=new THREE.Mesh(
        new THREE.BoxGeometry(1.25,standHeight,.62),
        glass
      );
      stand.position.set((column-1)*2.65,-2.15+standHeight/2,.35);
      vignette.stands.add(stand);
    }));
    this.updateGalleryVisibility();
  }
  updateGalleryVisibility() {
    if(!this.galleryGroups)return;
    const position=this.progress-this.imagesStart;
    this.galleryGroups.forEach((group,index)=>{
      const opacity=THREE.MathUtils.clamp(1-Math.abs(position-index),0,1);
      const visible=opacity>.01&&this.current===2;
      if(group.group.visible!==visible)group.group.visible=visible;
      if(group.photos.visible!==visible)group.photos.visible=visible;
      if(group.stands.visible!==visible)group.stands.visible=visible;
      group.label.visible=false;
      if(Math.abs(opacity-(group.opacity??-1))>.01){
        group.group.traverse(object=>{
          const materials=Array.isArray(object.material)?object.material:[object.material];
          materials.filter(Boolean).forEach(material=>{
            material.transparent=true;
            material.opacity=opacity;
          });
        });
        group.opacity=opacity;
      }
    });
  }
  makeArabicSprite(letter,size=.55,opacity=.55) {
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=INK;ctx.font='700 78px Amiri,"IBM Plex Sans Arabic",serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.direction='rtl';
    ctx.fillText(letter,64,68);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({
      map:texture,transparent:true,opacity,depthWrite:false,toneMapped:false
    }));
    sprite.scale.set(size,size,1);
    return sprite;
  }
  createZairja(layer) {
    this.rings=[];
    [2.05,3.0].forEach((radius,ringIndex)=>{
      const group=new THREE.Group();
      const circle=new THREE.Mesh(
        new THREE.TorusGeometry(radius,.01,6,168),
        new THREE.MeshBasicMaterial({color:0xf8f9f9,transparent:true,opacity:.7})
      );
      group.add(circle);
      if(ringIndex===0){
        const inner=1.48;
        const outer=2.62;
        const dividerMaterial=new THREE.MeshBasicMaterial({color:PAPER,transparent:true,opacity:.7,toneMapped:false});
        for(let i=0;i<ABJAD.length;i++){
          const angle=i/ABJAD.length*Math.PI*2;
          const divider=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,outer-inner,6),dividerMaterial);
          divider.position.set(Math.cos(angle)*(inner+outer)/2,Math.sin(angle)*(inner+outer)/2,.01);
          divider.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.cos(angle),Math.sin(angle),0));
          group.add(divider);
          const letter=this.makeArabicSprite(ABJAD[i][0],.37,.98);
          letter.position.set(Math.cos(angle+Math.PI/ABJAD.length)*2.05,Math.sin(angle+Math.PI/ABJAD.length)*2.05,.08);
          group.add(letter);
          const dot=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),new THREE.MeshBasicMaterial({color:0xffffff}));
          dot.position.set(Math.cos(angle)*radius,Math.sin(angle)*radius,.04);
          group.add(dot);
        }
      }else{
        const starPoints=[];
        for(let i=0;i<ABJAD.length*2;i++){
          const angle=i/(ABJAD.length*2)*Math.PI*2;
          const r=i%2?radius-.2:radius+.5;
          starPoints.push(new THREE.Vector3(Math.cos(angle)*r,Math.sin(angle)*r,.02));
        }
        for(let i=0;i<starPoints.length;i++){
          const start=starPoints[i],end=starPoints[(i+1)%starPoints.length];
          const direction=end.clone().sub(start);
          const edge=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,direction.length(),5),new THREE.MeshBasicMaterial({color:0xf8f9f9,transparent:true,opacity:.7}));
          edge.position.copy(start).add(end).multiplyScalar(.5);
          edge.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
          group.add(edge);
        }
        ABJAD.forEach(([letter],i)=>{
          const angle=(i+.5)/ABJAD.length*Math.PI*2;
          const label=this.makeArabicSprite(letter,.26,.98);
          label.position.set(Math.cos(angle)*3.52,Math.sin(angle)*3.52,.1);
          group.add(label);
        });
      }
      group.position.set(0,0,.2+ringIndex*.02);
      group.userData.spin=ringIndex?-.12:.09;
      layer.add(group);this.rings.push(group);
      group.traverse(object=>{
        if(object.material)layer.userData.fadeMaterials.push(object.material);
      });
    });
    const archiveRing=new THREE.Group();
    archiveRing.position.set(0,0,.25);
    archiveRing.userData.spin=.025;
    archiveRing.add(new THREE.Mesh(
      new THREE.TorusGeometry(4.15,.008,5,220),
      new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.38})
    ));
    this.records.forEach((record,index)=>{
      const angle=(index+.5)/this.records.length*Math.PI*2;
      const label=this.makeArchiveRingLabel(record);
      label.position.set(Math.cos(angle)*4.15,Math.sin(angle)*4.15,.05);
      archiveRing.add(label);
    });
    layer.add(archiveRing);
    this.rings.push(archiveRing);
    const center=this.makeArabicSprite('ز',.8,.98);
    center.position.set(0,0,.25);
    layer.add(center);
    layer.userData.fadeMaterials.push(center.material);
  }
  makeArchiveRingLabel(record) {
    const canvas=document.createElement('canvas');
    canvas.width=256;canvas.height=64;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=INK;ctx.textBaseline='top';ctx.textAlign='center';
    ctx.font='22px "Times New Roman",serif';
    ctx.fillText(record.name||record.id,128,0,248);
    ctx.direction='rtl';
    ctx.font='24px Amiri,"IBM Plex Sans Arabic",serif';
    ctx.fillText(record.name_ar||record.name||record.id,252,34,248);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({
      map:texture,transparent:true,depthWrite:false,toneMapped:false,opacity:.78
    }));
    sprite.scale.set(.52,.14,1);
    return sprite;
  }
  makeArchiveRay(row){
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#111619';ctx.textBaseline='top';ctx.textAlign='left';ctx.direction='ltr';
    ctx.font='20px "Times New Roman",serif';
    ctx.fillText(`${row.name} [ ${row.city} ]`,10,8,492);
    ctx.font='16px "Times New Roman",serif';
    ctx.fillText((row.holdings||'').slice(0,62),10,36,492);
    ctx.direction='rtl';ctx.textAlign='right';ctx.font='700 23px Amiri,serif';
    ctx.fillText(`${row.name_ar||row.name} [ ${translatePlace(row.city)} ]`,502,70,492);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));
    sprite.scale.set(1.7,.42,1);
    return sprite;
  }
  createArabicDrift() {
    this.driftingLetters=new THREE.Group();
    this.scene.add(this.driftingLetters);
    for(let i=0;i<22;i++){
      const sprite=this.makeArabicSprite(ABJAD[i%ABJAD.length][0],.28+Math.random()*.28,.2);
      sprite.position.set((Math.random()-.5)*16,(Math.random()-.5)*9,-Math.random()*62);
      sprite.userData.speed=.08+Math.random()*.25;
      sprite.userData.phase=Math.random()*Math.PI*2;
      this.driftingLetters.add(sprite);
    }
  }
  drawArtwork(ctx,index) {
    ctx.clearRect(0,0,1200,700);
    ctx.strokeStyle='#f7f8f8';ctx.fillStyle='#d5dadd';ctx.lineWidth=2.6;
    ctx.lineCap='round';ctx.lineJoin='round';
    if(index===0){
      this.drawEqualEarth(ctx);
    }else if(index===1){
      this.drawEqualEarth(ctx);
    }else if(index===2){
      const rows=this.records.filter(row=>Number.isFinite(Number(row.start))&&row.city)
        .sort((a,b)=>Number(a.start)-Number(b.start)).slice(0,13);
      rows.forEach((row,i)=>{
        const y=78+i*45,x=60+((i*97)%540);
        const year=row.start||'undated',name=row.name||row.id,city=row.city||'';
        ctx.textAlign='left';ctx.textBaseline='top';ctx.direction='ltr';
        ctx.font='700 18px "Times New Roman",serif';ctx.fillText(`${year} /`,x,y);
        const yearWidth=ctx.measureText(`${year} / `).width;
        ctx.font='18px "Times New Roman",serif';ctx.fillText(`${name} [ ${city} ] / ${row.media||'archive'}`,x+yearWidth,y);
        ctx.direction='rtl';ctx.textAlign='right';
        ctx.font='17px "IBM Plex Sans Arabic",serif';
        ctx.fillText(`${arabicArchiveDate(year)} / ${row.name_ar||name} [ ${translatePlace(city)} ] / ${translateMedia(row.media||'archive')}`,1140,y+23);
      });
    }else if(index===3){
      const rows=this.records.slice(0,15);
      rows.forEach((row,i)=>{
        const col=i%5,line=Math.floor(i/5),x=52+col*224,y=70+line*188;
        ctx.strokeRect(x,y,196,158);
        ctx.strokeRect(x+12,y+12,172,88);
        if(i%3===0){
          ctx.beginPath();ctx.arc(x+98,y+55,24,0,Math.PI*2);
          ctx.moveTo(x+20,y+83);ctx.lineTo(x+78,y+37);ctx.lineTo(x+118,y+75);ctx.lineTo(x+168,y+31);ctx.stroke();
        }else if(i%3===1){
          ctx.beginPath();ctx.moveTo(x+22,y+76);ctx.lineTo(x+24,y+34);ctx.lineTo(x+75,y+66);ctx.lineTo(x+117,y+31);ctx.lineTo(x+173,y+79);ctx.stroke();
        }else{
          ctx.beginPath();ctx.arc(x+62,y+56,21,0,Math.PI*2);ctx.arc(x+133,y+56,21,0,Math.PI*2);ctx.stroke();
        }
        const name=row.name||row.id,city=row.city||'',year=row.start||'undated';
        ctx.fillStyle=INK;ctx.textAlign='left';ctx.direction='ltr';ctx.textBaseline='top';
        ctx.font='700 14px "IBM Plex Sans",Arial,sans-serif';
        ctx.fillText(`${year} /`,x+12,y+108);
        const yearWidth=ctx.measureText(`${year} / `).width;
        ctx.font='14px "IBM Plex Sans",Arial,sans-serif';
        ctx.fillText(name,x+12+yearWidth,y+108,174-yearWidth);
        ctx.font='12px "IBM Plex Sans",Arial,sans-serif';
        ctx.fillText(`[ ${city} ] / ${row.media||'archive'}`,x+12,y+127,174);
        ctx.direction='rtl';ctx.textAlign='right';
        ctx.font='13px "IBM Plex Sans Arabic",sans-serif';
        ctx.fillText(`${arabicArchiveDate(year)} / ${row.name_ar||name} [ ${translatePlace(city)} ] / ${translateMedia(row.media||'archive')}`,x+184,y+144,174);
      });
    }else{
      ctx.lineWidth=2.2;
      ctx.beginPath();
      ctx.moveTo(310,570);ctx.lineTo(310,350);ctx.lineTo(890,350);ctx.lineTo(890,570);
      ctx.moveTo(270,350);ctx.lineTo(600,180);ctx.lineTo(930,350);
      ctx.moveTo(300,570);ctx.lineTo(900,570);
      ctx.moveTo(390,350);ctx.lineTo(390,570);ctx.moveTo(810,350);ctx.lineTo(810,570);
      ctx.stroke();
      ctx.strokeRect(465,270,270,120);
      ctx.strokeRect(490,295,220,72);
      ctx.beginPath();ctx.moveTo(510,450);ctx.lineTo(690,450);ctx.lineTo(760,515);ctx.lineTo(440,515);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.moveTo(485,535);ctx.lineTo(715,535);ctx.moveTo(500,550);ctx.lineTo(700,550);ctx.stroke();
      for(let i=0;i<5;i++)ctx.strokeRect(500+i*40,310,28,40);
    }
  }
  drawEqualEarth(ctx) {
    const project=(lon,lat)=>{
      const lambda=lon*Math.PI/180,phi=lat*Math.PI/180;
      const theta=Math.asin(Math.sqrt(3)/2*Math.sin(phi));
      const t2=theta*theta,t6=t2*t2*t2;
      const x=(2*Math.sqrt(3)*lambda*Math.cos(theta))/(3*(1.340264-0.081106*3*t2+t6*(7*0.000893+9*0.003796*t2)));
      const y=theta*(1.340264-0.081106*t2+t6*(0.000893+0.003796*t2));
      return [600+x*77,350-y*132];
    };
    CONTINENTS.forEach(points=>{
      ctx.beginPath();
      points.forEach(([lon,lat],i)=>{
        const [x,y]=project(lon,lat);
        if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
      });
      ctx.closePath();ctx.fillStyle='rgba(220,225,228,.32)';ctx.fill();ctx.strokeStyle='#f0f2f3';ctx.stroke();
    });
    this.records.forEach((row,i)=>{
      const [x,y]=project(Number(row.lon)||0,Number(row.lat)||0);
      ctx.beginPath();ctx.fillStyle='#ffffff';ctx.globalAlpha=.94;
      ctx.arc(x,y,3.2,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
    });
  }
  setLayerOpacity(index,opacity) {
    const layer=this.layers[index];
    if(Math.abs(opacity-(layer.userData.opacity??-1))<.01)return;
    layer.userData.opacity=opacity;
    layer.visible=opacity>.01;
    const materials=new Set();
    layer.traverse(object=>{
      const list=Array.isArray(object.material)?object.material:[object.material];
      list.filter(Boolean).forEach(material=>materials.add(material));
    });
    materials.forEach(material=>{
      material.transparent=true;
      material.opacity=opacity;
    });
  }
  setCaption(index) {
    document.body.classList.toggle('opening-later',index>0);
    this.captions.forEach((element,i)=>{
      if(!element)return;
      const visible=i===index&&index===0;
      element.classList.toggle('visible',visible);
      element.setAttribute('aria-hidden',String(!visible));
      if(visible)this.renderCaptionPage(element,0);
    });
    this.pageElapsed=0;
    this.updateGalleryVisibility();
    if(this.networkBar)this.networkBar.style.display='none';
  }
  updateNetworkBar(){
    if(!this.networkBar)return;
    const outside=this.records.filter(row=>String(row.in_arab_world).toLowerCase()!=='true').length;
    const dateTime=formatBilingualDateTime(new Date());
    this.networkBar.querySelector('.network-en').textContent=`${this.records.length} archives / ${outside} outside the Arab world / ${this.edges.length} links / ${dateTime.en}`;
    this.networkBar.querySelector('.network-ar').textContent=`${arabicDigits(this.records.length)} أرشيف / ${arabicDigits(outside)} خارج العالم العربي / ${arabicDigits(this.edges.length)} رابط / ${dateTime.ar}`;
  }
  advanceRide(amount) {
    if(this.done||amount<=0)return;
    if(!this.cameraStops){
      this.pendingRideProgress=Math.min(1,this.pendingRideProgress+amount);
      if(this.pendingRideProgress>=.9)
        window.dispatchEvent(new Event('seeing-archives:preload-cafe'));
      return;
    }
    this.targetRideProgress=this.advanceThroughDwellZones(this.targetRideProgress,amount);
    if(this.targetRideProgress>=.9)
      window.dispatchEvent(new Event('seeing-archives:preload-cafe'));
  }
  advanceThroughDwellZones(progress,amount) {
    let path=this.cafeStop*progress;
    let remaining=this.cafeStop*amount;
    const dwellStops=[
      ...this.informationBlocks.map((_,index)=>this.infoStart+index),
      ...this.galleryGroups.map((_,index)=>this.imagesStart+index)
    ];
    while(remaining>0&&path<this.cafeStop){
      let nextBoundary=this.cafeStop;
      let speed=1;
      for(const stop of dwellStops){
        const start=Math.max(0,stop-.05);
        const end=Math.min(this.cafeStop,stop+.05);
        if(path>=start&&path<end){
          nextBoundary=end;
          speed=.25;
          break;
        }
        if(start>path)nextBoundary=Math.min(nextBoundary,start);
      }
      const inputToBoundary=(nextBoundary-path)/speed;
      if(remaining<inputToBoundary){
        path+=remaining*speed;
        remaining=0;
      }else{
        path=nextBoundary;
        remaining-=inputToBoundary;
      }
    }
    return Math.min(1,path/this.cafeStop);
  }
  scrollBy(amount) {
    this.advanceRide(Math.max(0,amount));
  }
  jumpToScene(index) {
    if(!Number.isInteger(index)||index<0||index>3)
      throw new RangeError(`Unknown opening scene: ${index}`);
    if(index===3){
      window.dispatchEvent(new Event('seeing-archives:preload-cafe'));
    }
    const stop=index===0?0:index===1?this.infoStart:
      index===2?this.imagesStart:this.cafeStop;
    this.targetRideProgress=stop/this.cafeStop;
  }
  setRideProgress(value,immediate=false) {
    this.targetRideProgress=THREE.MathUtils.clamp(value/3,0,1);
    if(immediate){
      this.progress=this.targetRideProgress;
      this.updateCameraAlongPath();
    }
  }
  updateInformationBlocks() {
    if(!this.informationBlocks)return;
    const position=this.progress*this.cafeStop-this.infoStart;
    this.informationBlocks.forEach((block,index)=>{
      const opacity=THREE.MathUtils.clamp(1-Math.abs(position-index),0,1);
      const visible=opacity>.01;
      if(block.mesh.visible!==visible)block.mesh.visible=visible;
      if(Math.abs(opacity-(block.opacity??-1))>.01){
        block.mesh.material.opacity=opacity;
        block.opacity=opacity;
      }
    });
  }
  updateCameraAlongPath() {
    const pathProgress=this.progress*this.cafeStop;
    const segment=Math.min(Math.floor(pathProgress),this.cameraStopCount-2);
    const amount=pathProgress-segment;
    this.camera.position.lerpVectors(
      this.cameraStops[segment],this.cameraStops[segment+1],amount
    );
    this.camera.up.set(0,1,0);
    this.camera.lookAt(this.camera.position.clone().add(new THREE.Vector3(0,0,-1)));
    const stageProgress=pathProgress+1e-8;
    this.current=stageProgress<this.infoStart?0:
      stageProgress<this.imagesStart?1:
      stageProgress<this.cafeStop?2:3;
    this.stopIndex=Math.min(this.cafeStop,Math.floor(pathProgress));
  }
  update(dt) {
    if(this.done||!this.layers||!this.cameraStops?.length)return;
    this.progress+=(this.targetRideProgress-this.progress)*.05;
    if(this.targetRideProgress>=1&&this.progress>=.999)this.progress=1;
    this.updateCameraAlongPath();
    const pathProgress=this.progress*this.cafeStop;
    const fogProgress=THREE.MathUtils.clamp(
      (pathProgress-(this.cafeStop-.8))/.8,0,1
    );
    this.setFogOpacity(fogProgress*.96);
    if(this.globe){
      const globeOpacity=THREE.MathUtils.clamp(1-this.progress,0,1);
      this.setLayerOpacity(0,globeOpacity);
    }
    const openingSentence=this.captions[0];
    const sentenceVisible=pathProgress<.9;
    if(openingSentence){
      openingSentence.classList.toggle('visible',sentenceVisible);
      openingSentence.setAttribute('aria-hidden',String(!sentenceVisible));
    }
    document.body.classList.toggle('opening-later',this.current>0);
    if(this.globe&&this.current===0)
      this.globe.rotation.y=THREE.MathUtils.damp(
        this.globe.rotation.y,this.globe.userData.targetRotation,.18,dt
      );
    this.updateInformationBlocks();
    this.updateGalleryVisibility();
    if(this.progress>=.999){
      this.finish();
      return;
    }
  }
  setFogOpacity(opacity) {
    const fog=document.querySelector('#arrival-fog');
    if(Math.abs(Number(fog.style.opacity)-opacity)>.005){
      fog.style.transition='none';
      fog.style.opacity=String(opacity);
    }
  }
  finish() {
    if(this.done)return;
    this.done=true;
    window.inRoom=true;
    this.cards.style.opacity='0';
    if(this.networkBar)this.networkBar.style.display='none';
    this.skip.style.display='none';
    removeEventListener('keydown',this.onKey);
    removeEventListener('keydown',this.onKeyCapture,true);
    removeEventListener('touchstart',this.onTouchStart);
    removeEventListener('touchend',this.onTouchEnd);
    this.cards.replaceChildren();
    window.dispatchEvent(new Event('seeing-archives:enter-cafe'));
  }
  dispose() {
    removeEventListener('keydown',this.onKey);
    removeEventListener('keydown',this.onKeyCapture,true);
    removeEventListener('touchstart',this.onTouchStart);
    removeEventListener('touchend',this.onTouchEnd);
    const disposedTextures=new Set();
    const geometries=new Set(),materials=new Set();
    this.layers?.forEach(layer=>{
      this.scene.remove(layer);
      layer.traverse(object=>{
        object.userData.imageBitmap?.close();
        object.userData.imageBitmap=null;
        if(object.geometry)geometries.add(object.geometry);
        const list=Array.isArray(object.material)?object.material:[object.material];
        list.filter(Boolean).forEach(material=>materials.add(material));
      });
    });
    materials.forEach(material=>{
      const maps=Object.values(material).filter(value=>value?.isTexture);
      material.uniforms&&Object.values(material.uniforms).forEach(uniform=>{
        if(uniform.value?.isTexture)maps.push(uniform.value);
      });
      maps.forEach(texture=>{
        if(!disposedTextures.has(texture)){
          disposedTextures.add(texture);
          texture.dispose();
        }
      });
      material.dispose();
    });
    geometries.forEach(geometry=>geometry.dispose());
  }
}
