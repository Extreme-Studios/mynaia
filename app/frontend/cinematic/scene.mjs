import * as THREE from 'three';

function ribbon(points, color, radius = 0.009, opacity = 0.75) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 96, radius, 4, false),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
}

function world(color, secondary, playful = false) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(playful ? 0.92 : 1.08, 5),
    new THREE.MeshPhysicalMaterial({ color, metalness: 0.3, roughness: 0.2, transparent: true, opacity: 0.78,
      emissive: color, emissiveIntensity: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.18 }));
  core.scale.set(0.88, 1.13, 0.62);
  group.add(core);
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 2),
    new THREE.MeshBasicMaterial({ color: secondary, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending }));
  inner.position.z = -0.06;
  group.add(inner);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.34 + i * 0.2, i ? 0.006 : 0.014, 6, 108),
      new THREE.MeshBasicMaterial({ color: i === 1 ? secondary : color, transparent: true,
        opacity: i === 0 ? 0.76 : 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.set(0.28 + i * 0.3, -0.6 + i * 0.5, i * 0.55);
    group.add(ring);
  }
  const path = playful
    ? [[-1.8,-0.4,-0.5],[-1.4,1.15,0.1],[-0.4,1.5,0.5],[1.1,0.8,0.1],[1.7,-0.7,-0.4]]
    : [[-1.8,-0.8,-0.4],[-1.3,0.5,0.3],[-0.2,1.55,0.6],[1.2,0.9,0.3],[1.8,-0.55,-0.4]];
  group.add(ribbon(path, secondary, 0.012, 0.66));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: secondary, transparent: true,
    opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(5.3, 5.3, 1);
  glow.position.z = -0.7;
  group.add(glow);
  const light = new THREE.PointLight(color, 12, 9);
  light.position.set(0, 0, 1.5);
  group.add(light);
  return { group, core, inner, light };
}

let sharedGlow;
function glowTexture() {
  if (sharedGlow) return sharedGlow;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 63);
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.2, '#ffffffa0'); gradient.addColorStop(1, '#ffffff00');
  context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  sharedGlow = new THREE.CanvasTexture(canvas);
  return sharedGlow;
}

export function createScene(particleCount) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#030710');
  scene.fog = new THREE.FogExp2('#07101e', 0.032);
  scene.add(new THREE.AmbientLight('#a4bfd4', 1.4));
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 12);
  const naya = world('#63b9ce', '#f3c5a2');
  const paws = world('#f2aa72', '#ffe0a3', true);
  scene.add(naya.group, paws.group);
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 22;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 13;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 4;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#bed4e8', size: 0.034,
    transparent: true, opacity: 0.6, sizeAttenuation: true, depthWrite: false }));
  scene.add(dust);
  const lightBars = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI * 2 / 12;
    const bar = ribbon([[Math.cos(angle) * 0.45, Math.sin(angle) * 0.45, -2],
      [Math.cos(angle + 0.4) * 1.1, Math.sin(angle + 0.4) * 1.1, -1.5],
      [Math.cos(angle + 0.7) * 1.8, Math.sin(angle + 0.7) * 1.8, -2]], '#94b4db', 0.009, 0.36);
    lightBars.add(bar);
  }
  scene.add(lightBars);
  const logo = new THREE.Group();
  const mark = ribbon([[-0.5,-0.68,0],[-0.5,0.68,0],[0.5,-0.68,0],[0.5,0.68,0]], '#d6e9f6', 0.026, 0.95);
  logo.add(mark);
  scene.add(logo);
  const resize = (width, height) => {
    const mobile = width < 680;
    const side = Math.min(2.65, (width / height) * 1.95);
    const scale = mobile ? 0.64 : width < 1100 ? 0.72 : 1;
    camera.aspect = width / height; camera.updateProjectionMatrix();
    naya.group.position.set(mobile ? 0 : -side, mobile ? 1.85 : 0.15, -0.4);
    paws.group.position.set(mobile ? 0 : side, mobile ? -1.65 : 0.15, -0.7);
    naya.group.scale.setScalar(scale);
    paws.group.scale.setScalar(scale);
  };
  return { scene, camera, naya, paws, dust, logo, lightBars, resize };
}

export function disposeScene(scene) {
  scene.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose();
  });
  sharedGlow?.dispose(); sharedGlow = null;
}
