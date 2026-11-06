import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const host = document.getElementById('stage');
if (host) { try { init(); } catch (e) { console.warn('3D выключено:', e); } }

function init() {
  const cv = document.createElement('canvas'); cv.className = 'cv'; host.prepend(cv);
  const R = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true });
  R.setPixelRatio(Math.min(devicePixelRatio, 2));
  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 2, .1, 60);
  cam.position.set(0, 1.3, 10.5); cam.lookAt(0, 0, 0);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x9fc59f, 2.2));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(3, 6, 6); sc.add(dl);
  const fit = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  new ResizeObserver(fit).observe(host);

  // острова
  const grass = new THREE.MeshStandardMaterial({ color: 0x35c47a, roughness: .9 });
  const dirt = new THREE.MeshStandardMaterial({ color: 0x7a4e2d, roughness: 1 });
  [-3.1, 3.1].forEach(x => {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.45, .35, 28), grass);
    const bot = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.8, 28), dirt);
    bot.rotation.x = Math.PI; bot.position.y = -1.07;
    const g = new THREE.Group(); g.add(top, bot); g.position.set(x, -1, 0); sc.add(g);
  });

  // мост: доски, канаты, столбы
  const N = 9, bx = i => (i - (N - 1) / 2) * .46;
  const SH = 0x8d8478, WOOD = 0xb4793a, GOLD = 0xffc93c, ROPE_OK = 0xd9b27a, ROPE_GOLD = 0xfff1a8;
  const planks = [], ropes = [];
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.4, .09, 1.1), new THREE.MeshStandardMaterial({ roughness: .8 }));
    sc.add(m); planks.push({ m, i, vy: 0, vr: new THREE.Vector3(), fall: false });
  }
  [-.55, .55].forEach(z => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, N * .46, 8), new THREE.MeshStandardMaterial({ roughness: .9 }));
    sc.add(m); ropes.push({ m, z, vy: 0 });
    [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .6, 8), dirt); p.position.set(s * 2.1, -.55, z); sc.add(p); });
  });

  // персонажи
  const loader = new GLTFLoader();
  const chars = [['assets/hero.glb', -3.1, 1], ['assets/ranger.glb', 3.1, -1]].map(([url, home, d]) => {
    const g = new THREE.Group(); g.position.set(home, 0, 0); sc.add(g);
    loader.load(url, gl => {
      const m = gl.scene;
      m.traverse(o => { if (o.isMesh) { const a = o.material; a.metalness = 0; a.roughness = .85; a.metalnessMap = null; a.roughnessMap = null; a.needsUpdate = true; } });
      m.scale.setScalar(.95); m.position.y = -.825 + .95 * .95; m.rotation.y = d * 1.0; g.add(m);
    }, undefined, e => console.warn('модель не загрузилась', url, e));
    return { g, home, d };
  });

  // конфетти
  const CN = 90, cp = new Float32Array(CN * 3), cc = new Float32Array(CN * 3), cvel = [];
  const pal = [0xffc93c, 0xff6b5e, 0x2fbf71, 0x3aa0ff, 0xffffff].map(c => new THREE.Color(c));
  for (let i = 0; i < CN; i++) { const c = pal[i % 5]; cc.set([c.r, c.g, c.b], i * 3); cvel.push(new THREE.Vector3()); }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(cp, 3)); cg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const confetti = new THREE.Points(cg, new THREE.PointsMaterial({ size: .16, vertexColors: true }));
  confetti.frustumCulled = false; confetti.visible = false; sc.add(confetti);
  const burst = () => {
    for (let i = 0; i < CN; i++) { cp.set([0, .5, .4], i * 3); cvel[i].set((Math.random() - .5) * 6, 2 + Math.random() * 4, (Math.random() - .3) * 2); }
    confetti.visible = true;
  };

  let mode = 'idle', tier = 1, t0 = performance.now(), last = t0, burstDone = false;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), ease = k => 1 - Math.pow(1 - k, 3);
  const A = new THREE.Color(), B = new THREE.Color();

  function reset() {
    mode = 'idle'; burstDone = false; confetti.visible = false;
    planks.forEach(p => {
      p.fall = false; p.vy = 0; p.m.visible = true;
      p.m.position.set(bx(p.i), -.85 + Math.sin(p.i * 7) * .04, 0);
      p.m.rotation.set(0, 0, Math.sin(p.i * 5) * .12); p.m.scale.set(.75, 1, 1);
      p.m.material.color.set(SH); p.m.material.emissive.set(0x000000);
    });
    ropes.forEach(r => { r.vy = 0; r.m.visible = true; r.m.position.set(0, -.3, r.z); r.m.rotation.set(0, 0, Math.PI / 2); r.m.scale.set(.6, 1, .6); r.m.material.color.set(SH); });
  }
  function react(pts) {
    reset(); t0 = performance.now();
    if (pts < 40) mode = 'bad'; else { mode = 'up'; tier = pts >= 70 ? 2 : 1; }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!host.offsetParent) return;
    const dt = Math.min((now - last) / 1000, .05); last = now;
    const t = (now - t0) / 1000;

    if (mode === 'idle') {
      chars.forEach((c, i) => {
        const k = Math.min(1, dt * 8);
        c.g.position.x += (c.home - c.g.position.x) * k;
        c.g.position.y += (Math.sin(now / 500 + i * 2) * .015 - c.g.position.y) * k;
        c.g.rotation.z *= .8;
      });
    }

    if (mode === 'up') {
      const col = tier === 2 ? GOLD : WOOD;
      planks.forEach(p => {
        const k = clamp((t - p.i * .07) / .4), e = ease(k);
        p.m.position.y = -.85 + (1 - e) * Math.sin(p.i * 7) * .04 + Math.sin(k * Math.PI) * .35;
        p.m.rotation.z = (1 - e) * Math.sin(p.i * 5) * .12;
        p.m.scale.x = .75 + .4 * e;
        p.m.material.color.copy(A.set(SH).lerp(B.set(col), e));
        if (tier === 2 && k > 0) p.m.material.emissive.setHex(0x331d00);
      });
      const e2 = ease(clamp(t / .9));
      ropes.forEach(r => {
        r.m.material.color.copy(A.set(SH).lerp(B.set(tier === 2 ? ROPE_GOLD : ROPE_OK), e2));
        r.m.scale.set(.6 + .6 * e2, 1, .6 + .6 * e2);
      });
      chars.forEach(c => {
        let x = c.home, y = 0;
        if (t < 1.4) y = Math.abs(Math.sin(t * 7)) * .3;
        if (tier === 2) {
          const w = clamp((t - 1.4) / 2);
          x = c.home + c.d * (Math.abs(c.home) - .65) * ease(w);
          if (w > 0 && w < 1) y = Math.abs(Math.sin(t * 9)) * .1;
          if (t > 3.5) y = t < 5.2 ? Math.abs(Math.sin((t - 3.5) * 8)) * .35 : 0;
          if (t > 3.5 && !burstDone) { burst(); burstDone = true; }
        } else if (t >= 1.4 && t < 2.2) y = Math.abs(Math.sin((t - 1.4) * 6)) * .15;
        c.g.position.set(x, y, 0);
      });
    }

    if (mode === 'bad') {
      planks.forEach(p => {
        const start = .35 + Math.abs(p.i - (N - 1) / 2) * .12;
        if (t < start) { p.m.position.y = -.85 + Math.sin(t * 60 + p.i) * .02; p.m.material.color.set(0x5a3a2a); return; }
        if (!p.fall) { p.fall = true; p.vr.set((Math.random() - .5) * 4, (Math.random() - .5) * 2, (Math.random() - .5) * 6); }
        p.vy -= 14 * dt; p.m.position.y += p.vy * dt;
        p.m.rotation.x += p.vr.x * dt; p.m.rotation.y += p.vr.y * dt; p.m.rotation.z += p.vr.z * dt;
        if (p.m.position.y < -7) p.m.visible = false;
      });
      ropes.forEach(r => {
        if (t < .9) return;
        r.vy -= 14 * dt; r.m.position.y += r.vy * dt; r.m.rotation.z += dt * (r.z > 0 ? 1.2 : -1.2);
        if (r.m.position.y < -7) r.m.visible = false;
      });
      chars.forEach(c => {
        const k = ease(clamp(t / .5));
        const lean = c.d * .1 * ease(clamp((t - 1) / .6));
        c.g.position.set(c.home - c.d * .35 * k, 0, 0);
        c.g.rotation.z = lean + Math.sin(t * 28) * .12 * Math.exp(-t * 2.2);
      });
    }

    if (confetti.visible) {
      for (let i = 0; i < CN; i++) {
        cvel[i].y -= 7 * dt;
        cp[i * 3] += cvel[i].x * dt; cp[i * 3 + 1] += cvel[i].y * dt; cp[i * 3 + 2] += cvel[i].z * dt;
      }
      cg.attributes.position.needsUpdate = true;
    }
    R.render(sc, cam);
  }
  reset(); fit(); requestAnimationFrame(frame);
  window.Bridge3D = { reset, react };
}
