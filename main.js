// ═══════════════════════════════════════════════════════════════
//  MURSED.dev — MAIN.JS — OPTIMIZED
//  Fast loading, simple gestures, stable sphere
// ═══════════════════════════════════════════════════════════════

import { PhysicsEngine } from './physics.js';
import { Renderer      } from './renderer.js';
import { HandTracker   } from './hand-tracker.js';
import { UI            } from './ui.js';

// ── OPTIMIZED PARTICLE COUNT ─────────────────────────────────────
const N = 80000;  // Fixed 80K for all devices - smooth & dense

// ── MINIMAL LOADING SCREEN ───────────────────────────────────────
function buildLoader(){
  const el = document.createElement('div');
  el.id = 'ax-loader';
  el.innerHTML = `
    <div class="axl-bg"></div>
    <div class="axl-content">
      <div class="axl-title">MURSED<span>.dev</span></div>
      <div class="axl-status" id="axl-status">LOADING...</div>
    </div>
  `;
  document.body.appendChild(el);

  const style = document.createElement('style');
  style.textContent = `
    #ax-loader {
      position:fixed;inset:0;z-index:1000;
      display:flex;align-items:center;justify-content:center;
      background:#000;
      transition:opacity 0.5s;
    }
    .axl-content {
      text-align:center;
      font-family:'Share Tech Mono',monospace;
    }
    .axl-title {
      font-family:'Orbitron',sans-serif;
      font-size:clamp(32px,6vw,48px);
      font-weight:900;
      letter-spacing:8px;
      color:#00d4ff;
      text-shadow:0 0 30px #00d4ff;
    }
    .axl-title span { color:#00ffcc; }
    .axl-status {
      font-size:10px;
      letter-spacing:3px;
      color:rgba(0,212,255,0.5);
      margin-top:16px;
    }
  `;
  document.head.appendChild(style);
  return el;
}

function hideLoader(el){
  el.style.opacity = '0';
  setTimeout(()=>el.remove(), 500);
}

// ── MAIN ─────────────────────────────────────────────────────────
async function main(){
  const loader = buildLoader();

  try {
    // Init UI
    const ui = new UI();

    // Init Physics - FAST allocation
    const physics = new PhysicsEngine(N);

    // Init Renderer
    const canvas   = document.getElementById('ax-canvas');
    const renderer = new Renderer(canvas);
    renderer.setupParticles(physics);

    // Init Hand Tracker
    const video = document.getElementById('ax-video');
    let handState = { present:false, gestureId:0, gestureT:0 };

    const tracker = new HandTracker(video, (state)=>{
      handState = state;
      physics.setHand(state);
      ui.drawHand(state.landmarks);
      ui.updateGesture(state.gestureName, state.gestureT);
      ui.setStatus(state.present
        ? { type:'on',   text:'TRACKING' }
        : { type:'seek', text:'SEARCHING' }
      );
    });

    await tracker.init();

    // Hide loader immediately
    hideLoader(loader);
    ui.setStatus({ type:'on', text:'READY' });

    // ── MAIN LOOP ─────────────────────────────────────────────
    let lastStatsUpdate = 0;

    function loop(now){
      requestAnimationFrame(loop);

      tracker.update();
      physics.tick();
      renderer.render(now * 0.001, handState);

      // UI stats (throttled)
      if(now - lastStatsUpdate > 400){
        const fps = ui.tickFPS(now);
        const vel = handState.present
          ? Math.sqrt((handState.worldX||0)**2+(handState.worldY||0)**2)
          : 0;
        ui.updateStats(N, fps, 'SPHERE', handState.worldZ || 0, vel);
        lastStatsUpdate = now;
      }
    }

    requestAnimationFrame(loop);
    console.log(`[MURSED.dev] ${N.toLocaleString()} particles ready`);

  } catch(err){
    console.error('[MURSED.dev] Error:', err);
    document.getElementById('axl-status').textContent = 'ERROR: ' + err.message;
  }
}

main();
