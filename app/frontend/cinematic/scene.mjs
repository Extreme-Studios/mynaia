import * as THREE from 'three';

function ribbon(points, color, opacity = 0.12) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x,y,z]) => new THREE.Vector3(x,y,z)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.006, 3, false),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
}
function atmosphere(color, direction) {
  const group = new THREE.Group();
  for (let i=0;i<3;i++) group.add(ribbon([[-6,-3+i,-5],[-3,0+i*.4,-8],[2,2+i,-10],[6,4+i,-12]],color));
  const light = new THREE.PointLight(color,12,9); light.position.set(direction*2,0,-3); group.add(light);
  return {group,light};
}
export function createScene(particleCount) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05080d');
  scene.fog = new THREE.FogExp2('#07101e',0.025);
  const camera = new THREE.PerspectiveCamera(42,1,0.1,100); camera.position.set(0,0,12);
  const naya=atmosphere('#82b7c3',-1), paws=atmosphere('#dbb48b',1);
  scene.add(naya.group,paws.group);
  const geometry=new THREE.BufferGeometry(), positions=new Float32Array(particleCount*3);
  for(let i=0;i<particleCount;i++) { positions[i*3]=(Math.random()-.5)*26; positions[i*3+1]=(Math.random()-.5)*16; positions[i*3+2]=-3-Math.random()*20; }
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const dust=new THREE.Points(geometry,new THREE.PointsMaterial({color:'#b5c9d1',size:.025,transparent:true,opacity:.35,depthWrite:false})); scene.add(dust);
  const lightBars=new THREE.Group();
  lightBars.add(ribbon([[-6,-2,-8],[-2,1,-6],[3,3,-7]],'#b8cddd',.25)); scene.add(lightBars);
  const logo=new THREE.Group(); logo.add(ribbon([[-.5,-.68,0],[-.5,.68,0],[.5,-.68,0],[.5,.68,0]],'#d6e9f6',.95)); scene.add(logo);
  const resize=(width,height)=> {camera.aspect=width/height;camera.updateProjectionMatrix();};
  return {scene,camera,naya,paws,dust,logo,lightBars,resize};
}
export function disposeScene(scene) {
  scene.traverse(object=> {object.geometry?.dispose(); for(const material of Array.isArray(object.material)?object.material:[object.material]) material?.dispose();});
}
