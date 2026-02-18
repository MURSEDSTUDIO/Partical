// ═══════════════════════════════════════════════════════════════
//  MURSED.dev — MAIN.JS
//  Entry Point — Orchestrates Physics + Renderer + Hand + UI
// ═══════════════════════════════════════════════════════════════

import { PhysicsEngine } from './physics.js';
import { Renderer      } from './renderer.js';
import { HandTracker   } from './hand-tracker.js';
import { UI            } from './ui.js';

// ── PARTICLE COUNT ───────────────────────────────────────────────
// 5M is beast mode — detect device capability
function getParticleCount(){
  const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
  const isLowEnd = navigator.hardwareConcurrency <= 2;

  if(isMobile)   return 50_000;    // Mobile: 50K
  if(isLowEnd)   return 150_000;   // Low-end desktop: 150K
  return 400_000;                  // Desktop: 400K
}

const N = getParticleCount();

// ── LOADING SCREEN ───────────────────────────────────────────────
function buildLoader(){
  const el = document.createElement('div');
  el.id = 'ax-loader';
  el.innerHTML = `
    <div class="axl-bg"></div>
    <div class="axl-content">
      <div class="axl-title">MURSED<span>.dev</span></div>
      <div class="axl-subtitle">GESTURE PARTICLE SYSTEM</div>
      <div class="axl-subtitle2">PROFESSIONAL EDITION</div>
      <div class="axl-divider"></div>
      <div class="axl-status" id="axl-status">INITIALIZING...</div>
      <div class="axl-bar"><div class="axl-fill" id="axl-fill"></div></div>
      <div class="axl-particles" id="axl-n">— PARTICLES</div>
    </div>
  `;
  document.body.appendChild(el);

  const style = document.createElement('style');
  style.textContent = `
    #ax-loader {
      position:fixed;inset:0;z-index:1000;
      display:flex;align-items:center;justify-content:center;
      transition:opacity 1s;
    }
    .axl-bg {
      position:absolute;inset:0;
      background:radial-gradient(ellipse at center, #001828 0%, #000 70%);
    }
    .axl-content {
      position:relative;text-align:center;
      font-family:'Share Tech Mono',monospace;
    }
    .axl-title {
      font-family:'Orbitron',sans-serif;
      font-size:clamp(36px,8vw,72px);
      font-weight:900;
      letter-spacing:10px;
      color:#00d4ff;
      text-shadow:0 0 40px #00d4ff,0 0 80px rgba(0,212,255,0.3);
    }
    .axl-title span { color:#00ffcc; text-shadow:0 0 40px #00ffcc; }
    .axl-subtitle {
      font-size:clamp(8px,1.5vw,12px);
      letter-spacing:5px;
      color:rgba(0,212,255,0.5);
      margin-top:8px;
    }
    .axl-subtitle2 {
      font-size:clamp(7px,1.2vw,10px);
      letter-spacing:4px;
      color:rgba(0,255,200,0.4);
      margin-top:4px;
    }
    .axl-divider {
      width:300px;height:1px;
      background:linear-gradient(90deg,transparent,rgba(0,212,255,0.4),transparent);
      margin:24px auto;
    }
    .axl-status {
      font-size:9px;letter-spacing:3px;
      color:rgba(0,212,255,0.6);
      min-height:18px;
      transition:opacity 0.3s;
    }
    .axl-bar {
      width:280px;height:1px;
      background:rgba(0,212,255,0.1);
      margin:12px auto;position:relative;overflow:hidden;
    }
    .axl-fill {
      height:100%;width:0%;
      background:linear-gradient(90deg,transparent,#00d4ff,#00ffcc);
      transition:width 0.4s;
      box-shadow:0 0 10px #00d4ff;
    }
    .axl-particles {
      font-size:10px;letter-spacing:3px;
      color:rgba(0,255,200,0.5);
      margin-top:8px;
    }
  `;
  document.head.appendChild(style);

  document.getElementById('axl-n').textContent = N.toLocaleString() + ' PARTICLES';
  return el;
}

function setLoaderStatus(msg, pct){
  const s = document.getElementById('axl-status');
  const f = document.getElementById('axl-fill');
  if(s) s.textContent = msg;
  if(f) f.style.width = pct + '%';
}

function hideLoader(el){
  el.style.opacity = '0';
  setTimeout(()=>el.remove(), 1000);
}

// ── MAIN ─────────────────────────────────────────────────────────
async function main(){
  const loader = buildLoader();

  try {
    // 1. Init UI
    setLoaderStatus('BUILDING HUD...', 10);
    const ui = new UI();

    // 2. Init Physics
    setLoaderStatus(`ALLOCATING ${N.toLocaleString()} PARTICLES...`, 25);
    await new Promise(r=>setTimeout(r,50)); // Let DOM breathe
    const physics = new PhysicsEngine(N);

    // 3. Init Renderer
    setLoaderStatus('COMPILING GLSL SHADERS...', 45);
    await new Promise(r=>setTimeout(r,50));
    const canvas   = document.getElementById('ax-canvas');
    const renderer = new Renderer(canvas);
    renderer.setupParticles(physics);

    // 4. Init Hand Tracker
    setLoaderStatus('LOADING MEDIAPIPE AI MODEL...', 65);
    const video = document.getElementById('ax-video');
    let handState = { present:false, gestureId:0, gestureT:0 };

    const tracker = new HandTracker(video, (state)=>{
      handState = state;
      physics.setHand(state);
      ui.drawHand(state.landmarks);
      ui.updateGesture(state.gestureName, state.gestureT);
      ui.setStatus(state.present
        ? { type:'on',   text:'TRACKING ACTIVE' }
        : { type:'seek', text:'SEARCHING FOR HAND' }
      );
    });

    await tracker.init((msg)=>{
      setLoaderStatus(msg, 85);
      ui.setStatus({ type:'seek', text:msg });
    });

    setLoaderStatus('SYSTEM READY', 100);
    await new Promise(r=>setTimeout(r,400));
    hideLoader(loader);
    ui.setStatus({ type:'on', text:'CAMERA READY' });

    // ── MAIN LOOP ─────────────────────────────────────────────
    const FORMATIONS = ['SPHERE','GALAXY','DNA HELIX','VORTEX'];
    let lastStatsUpdate = 0;

    function loop(now){
      requestAnimationFrame(loop);

      // Sub-frame hand interpolation
      tracker.update();

      // Physics tick (chunked — processes CHUNK_SIZE particles per frame)
      physics.tick();

      // Render
      renderer.render(now * 0.001, handState);

      // UI stats (throttled)
      if(now - lastStatsUpdate > 350){
        const fps = ui.tickFPS(now);
        const vel = handState.present
          ? Math.sqrt((handState.worldX||0)**2+(handState.worldY||0)**2)
          : 0;
        ui.updateStats(
          N, fps,
          FORMATIONS[physics.formationPhase],
          handState.worldZ || 0,
          vel
        );
        lastStatsUpdate = now;
      }
    }

    requestAnimationFrame(loop);
    console.log(`[MURSED.dev] 🔥 ${N.toLocaleString()} particles — Professional Edition active`);

  } catch(err){
    console.error('[MURSED.dev] Fatal error:', err);
    setLoaderStatus('⚠ ERROR: ' + err.message, 0);
    document.getElementById('ax-loader').style.background = '#000';
  }
}

main();
