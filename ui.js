// ═══════════════════════════════════════════════════════════════
//  AXTAR — UI.JS
//  Cinematic HUD — Hand Overlay — Gesture Display — Stats
// ═══════════════════════════════════════════════════════════════

export class UI {
  constructor(){
    this._buildDOM();
    this._buildHandCanvas();

    this.fps       = 60;
    this._frames   = 0;
    this._fpsT     = 0;

    // Gesture display state
    this._curGesture  = 'NONE';
    this._gestureAnim = 0;

    // Corner animation
    this._cornerT = 0;

    window.addEventListener('resize', ()=>this._resizeHandCanvas());
  }

  _buildDOM(){
    document.body.insertAdjacentHTML('beforeend', `
    <div id="ax-hud">

      <!-- Corner brackets -->
      <div class="ax-corner ax-tl"></div>
      <div class="ax-corner ax-tr"></div>
      <div class="ax-corner ax-bl"></div>
      <div class="ax-corner ax-br"></div>

      <!-- Scanlines overlay -->
      <div class="ax-scanlines"></div>

      <!-- Title -->
      <div class="ax-title-block">
        <div class="ax-title">AXTAR<span class="ax-title-get">GET</span></div>
        <div class="ax-title-sub">GESTURE PARTICLE SYSTEM — WORLD EDITION</div>
        <div class="ax-title-line"></div>
      </div>

      <!-- Gesture center display -->
      <div class="ax-gesture-center" id="ax-gc">
        <div class="ax-gc-ring" id="ax-gc-ring"></div>
        <div class="ax-gc-icon" id="ax-gc-icon">👁</div>
        <div class="ax-gc-name" id="ax-gc-name">AWAITING HAND</div>
        <div class="ax-gc-bar"><div class="ax-gc-fill" id="ax-gc-fill"></div></div>
      </div>

      <!-- Stats panel -->
      <div class="ax-stats" id="ax-stats">
        <div class="ax-stat">PARTICLES <span class="ax-val" id="ax-s-n">—</span></div>
        <div class="ax-stat">FPS <span class="ax-val" id="ax-s-fps">—</span></div>
        <div class="ax-stat">FORMATION <span class="ax-val" id="ax-s-form">SPHERE</span></div>
        <div class="ax-stat">DEPTH <span class="ax-val" id="ax-s-depth">—</span></div>
        <div class="ax-stat">VELOCITY <span class="ax-val" id="ax-s-vel">—</span></div>
      </div>

      <!-- Cam wrap -->
      <div class="ax-cam-wrap" id="ax-cam-wrap">
        <div class="ax-cam-label">HAND TRACKING</div>
        <div class="ax-cam-inner">
          <canvas id="ax-wcam"></canvas>
          <canvas id="ax-hand"></canvas>
        </div>
        <div class="ax-cam-scan"></div>
      </div>

      <!-- Status row -->
      <div class="ax-status-row">
        <div class="ax-dot" id="ax-dot"></div>
        <span id="ax-status-txt">INITIALIZING</span>
      </div>

      <!-- Gesture guide -->
      <div class="ax-guide">
        <div class="ax-gi"><span>✋</span>ATTRACT</div>
        <div class="ax-gi"><span>🤏</span>GRAB</div>
        <div class="ax-gi"><span>👊</span>COMPRESS</div>
        <div class="ax-gi"><span>💨</span>SCATTER</div>
        <div class="ax-gi"><span>✌️</span>WAVE</div>
        <div class="ax-gi"><span>🖐</span>REPEL</div>
      </div>

    </div>
    `);

    this._injectCSS();
  }

  _injectCSS(){
    const css = `
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');

    #ax-hud {
      position:fixed; inset:0;
      pointer-events:none;
      z-index:10;
      font-family:'Share Tech Mono',monospace;
    }

    /* Scanlines */
    .ax-scanlines {
      position:fixed; inset:0;
      background:repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0,0,0,0.03) 2px,
        rgba(0,0,0,0.03) 4px
      );
      pointer-events:none;
    }

    /* Corner brackets */
    .ax-corner {
      position:absolute;
      width:28px; height:28px;
      border-color:rgba(0,212,255,0.4);
      border-style:solid;
      transition: opacity 0.3s;
    }
    .ax-tl { top:14px; left:14px; border-width:1.5px 0 0 1.5px; }
    .ax-tr { top:14px; right:14px; border-width:1.5px 1.5px 0 0; }
    .ax-bl { bottom:14px; left:14px; border-width:0 0 1.5px 1.5px; }
    .ax-br { bottom:14px; right:14px; border-width:0 1.5px 1.5px 0; }

    /* Title */
    .ax-title-block {
      position:absolute;
      top:22px; left:28px;
    }
    .ax-title {
      font-family:'Orbitron',sans-serif;
      font-size:clamp(20px,3vw,32px);
      font-weight:900;
      letter-spacing:6px;
      color:#00d4ff;
      text-shadow:0 0 20px #00d4ff, 0 0 50px rgba(0,212,255,0.3);
      line-height:1;
    }
    .ax-title-get {
      color:#00ffcc;
      text-shadow:0 0 20px #00ffcc;
    }
    .ax-title-sub {
      font-size:8px;
      letter-spacing:3px;
      color:rgba(0,212,255,0.4);
      margin-top:5px;
    }
    .ax-title-line {
      margin-top:8px;
      width:100%;
      height:1px;
      background:linear-gradient(90deg,rgba(0,212,255,0.5),transparent);
    }

    /* Gesture center */
    .ax-gesture-center {
      position:absolute;
      top:50%; left:50%;
      transform:translate(-50%, -200px);
      text-align:center;
      transition: opacity 0.4s;
    }
    .ax-gc-ring {
      width:80px; height:80px;
      border-radius:50%;
      border:1px solid rgba(0,212,255,0.2);
      margin:0 auto 8px;
      display:flex; align-items:center; justify-content:center;
      position:relative;
      transition: border-color 0.3s, box-shadow 0.3s;
    }
    .ax-gc-ring.active {
      border-color:rgba(0,212,255,0.7);
      box-shadow:0 0 20px rgba(0,212,255,0.3), inset 0 0 20px rgba(0,212,255,0.05);
      animation: ax-ring-pulse 1.5s ease-in-out infinite;
    }
    @keyframes ax-ring-pulse {
      0%,100%{ transform:scale(1); opacity:1; }
      50%{ transform:scale(1.05); opacity:0.8; }
    }
    .ax-gc-icon {
      font-size:32px;
      display:block;
      margin-bottom:6px;
      filter:drop-shadow(0 0 8px rgba(0,212,255,0.6));
      transition: transform 0.2s;
    }
    .ax-gc-name {
      font-size:11px;
      letter-spacing:3px;
      color:#00d4ff;
      text-shadow:0 0 10px #00d4ff;
      transition: color 0.3s;
    }
    .ax-gc-bar {
      width:120px; height:2px;
      background:rgba(0,212,255,0.1);
      margin:8px auto 0;
      border-radius:1px;
      overflow:hidden;
    }
    .ax-gc-fill {
      height:100%;
      width:0%;
      background:linear-gradient(90deg,#00d4ff,#00ffcc);
      border-radius:1px;
      transition: width 0.1s;
      box-shadow:0 0 6px #00d4ff;
    }

    /* Stats */
    .ax-stats {
      position:absolute;
      top:22px; right:22px;
      font-size:9px;
      letter-spacing:2px;
      color:rgba(0,212,255,0.4);
      text-align:right;
      line-height:2.0;
    }
    .ax-val { color:rgba(0,212,255,0.85); }

    /* Camera wrap */
    .ax-cam-wrap {
      position:absolute;
      bottom:60px; right:22px;
      width:clamp(140px,16vw,190px);
    }
    .ax-cam-label {
      font-size:7px;
      letter-spacing:3px;
      color:rgba(0,212,255,0.35);
      margin-bottom:4px;
      text-align:center;
    }
    .ax-cam-inner {
      position:relative;
      border:1px solid rgba(0,212,255,0.25);
      border-radius:6px;
      overflow:hidden;
      background:#000;
    }
    .ax-cam-inner canvas {
      display:block;
      width:100%;
    }
    #ax-wcam { opacity:0.7; transform:scaleX(-1); }
    #ax-hand { position:absolute; inset:0; transform:scaleX(-1); }
    .ax-cam-scan {
      position:absolute; inset:0;
      background:repeating-linear-gradient(
        0deg, transparent, transparent 3px,
        rgba(0,212,255,0.03) 3px, rgba(0,212,255,0.03) 4px
      );
      pointer-events:none;
      border-radius:6px;
    }

    /* Status */
    .ax-status-row {
      position:absolute;
      bottom:22px; left:22px;
      display:flex; align-items:center; gap:8px;
      font-size:8px; letter-spacing:3px;
      color:rgba(0,212,255,0.4);
    }
    .ax-dot {
      width:6px; height:6px; border-radius:50%;
      background:#333;
      transition: background 0.3s, box-shadow 0.3s;
    }
    .ax-dot.on   { background:#00ff88; box-shadow:0 0 8px #00ff88; animation:ax-blink 2s infinite; }
    .ax-dot.seek { background:#ffaa00; box-shadow:0 0 8px #ffaa00; animation:ax-blink 0.7s infinite; }
    .ax-dot.err  { background:#ff4444; box-shadow:0 0 8px #ff4444; }
    @keyframes ax-blink { 0%,100%{opacity:1} 50%{opacity:0.4} }

    /* Gesture guide */
    .ax-guide {
      position:absolute;
      bottom:22px; left:50%; transform:translateX(-50%);
      display:flex; gap:clamp(10px,2vw,22px);
      font-size:8px; letter-spacing:1px;
      color:rgba(0,212,255,0.28);
    }
    .ax-gi { text-align:center; }
    .ax-gi span { display:block; font-size:14px; margin-bottom:3px; }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  _buildHandCanvas(){
    // Will be sized after DOM is ready
    setTimeout(()=>{
      this._wcam = document.getElementById('ax-wcam');
      this._hand = document.getElementById('ax-hand');
      this._resizeHandCanvas();
    }, 100);
  }

  _resizeHandCanvas(){
    const wrap = document.getElementById('ax-cam-wrap');
    if(!wrap||!this._wcam) return;
    const w = wrap.offsetWidth;
    const h = Math.round(w * 0.75);
    this._wcam.width = this._hand.width  = w;
    this._wcam.height= this._hand.height = h;
    this._wCtx = this._wcam.getContext('2d');
    this._hCtx = this._hand.getContext('2d');
  }

  // ── HAND SKELETON CONNECTIONS ─────────────────────────────────
  static CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],         // thumb
    [0,5],[5,6],[6,7],[7,8],         // index
    [0,9],[9,10],[10,11],[11,12],    // middle
    [0,13],[13,14],[14,15],[15,16],  // ring
    [0,17],[17,18],[18,19],[19,20],  // pinky
    [5,9],[9,13],[13,17],[5,17]      // palm
  ];
  static TIPS = [4,8,12,16,20];

  drawHand(lm){
    if(!this._hCtx||!this._hand) return;
    const cw=this._hand.width, ch=this._hand.height;
    this._hCtx.clearRect(0,0,cw,ch);
    if(!lm||!lm.length) return;

    const px = i => lm[i].x * cw;
    const py = i => lm[i].y * ch;

    // Draw connections
    UI.CONNECTIONS.forEach(([a,b])=>{
      this._hCtx.beginPath();
      this._hCtx.moveTo(px(a), py(a));
      this._hCtx.lineTo(px(b), py(b));
      this._hCtx.strokeStyle = 'rgba(0,212,255,0.6)';
      this._hCtx.lineWidth   = 1.3;
      this._hCtx.stroke();
    });

    // Draw joints
    lm.forEach((p,i)=>{
      const isTip = UI.TIPS.includes(i);
      const x = p.x*cw, y = p.y*ch;
      // Outer glow
      if(isTip){
        this._hCtx.beginPath();
        this._hCtx.arc(x,y,7,0,Math.PI*2);
        this._hCtx.strokeStyle='rgba(0,255,200,0.2)';
        this._hCtx.lineWidth=1;
        this._hCtx.stroke();
      }
      // Joint dot
      this._hCtx.beginPath();
      this._hCtx.arc(x,y, isTip?3.5:2, 0, Math.PI*2);
      this._hCtx.fillStyle = isTip ? '#00ffcc' : 'rgba(0,180,255,0.9)';
      this._hCtx.fill();
    });

    // Palm center
    const pcx=(lm[0].x+lm[9].x)/2*cw;
    const pcy=(lm[0].y+lm[9].y)/2*ch;
    this._hCtx.beginPath();
    this._hCtx.arc(pcx,pcy,4,0,Math.PI*2);
    this._hCtx.fillStyle='rgba(255,200,0,0.85)';
    this._hCtx.fill();
  }

  drawWebcam(img){
    if(!this._wCtx||!this._wcam||!img) return;
    this._wCtx.drawImage(img,0,0,this._wcam.width,this._wcam.height);
  }

  // ── GESTURE DISPLAY ───────────────────────────────────────────
  static GESTURE_DATA = {
    NONE:  { icon:'👁',  name:'SHOW YOUR HAND',   color:'rgba(0,212,255,0.35)' },
    OPEN:  { icon:'✋',  name:'OPEN — ATTRACT',   color:'#00d4ff' },
    FIST:  { icon:'👊',  name:'FIST — COMPRESS',  color:'#ff6644' },
    SWIPE: { icon:'💨',  name:'SWIPE — SCATTER',  color:'#ffcc00' },
    PEACE: { icon:'✌️', name:'PEACE — WAVE',      color:'#aa88ff' },
    PINCH: { icon:'🤏',  name:'PINCH — GRAB',     color:'#00ffcc' },
    REPEL: { icon:'🖐',  name:'REPEL — PUSH',     color:'#ff88aa' },
    POINT: { icon:'☝️', name:'POINT — ATTRACT',   color:'#88ccff' },
  };

  updateGesture(name, holdT){
    const d = UI.GESTURE_DATA[name] || UI.GESTURE_DATA.NONE;
    document.getElementById('ax-gc-icon').textContent = d.icon;
    document.getElementById('ax-gc-name').textContent = d.name;
    document.getElementById('ax-gc-name').style.color = d.color;
    document.getElementById('ax-gc-fill').style.width = (holdT*100)+'%';

    const ring = document.getElementById('ax-gc-ring');
    ring.className = 'ax-gc-ring' + (name !== 'NONE' ? ' active' : '');
  }

  updateStats(n, fps, formation, depth, vel){
    document.getElementById('ax-s-n').textContent     = n.toLocaleString();
    document.getElementById('ax-s-fps').textContent   = fps;
    document.getElementById('ax-s-form').textContent  = formation;
    document.getElementById('ax-s-depth').textContent = depth.toFixed(3);
    document.getElementById('ax-s-vel').textContent   = vel.toFixed(2);
  }

  setStatus(state){
    const dot = document.getElementById('ax-dot');
    const txt = document.getElementById('ax-status-txt');
    dot.className = 'ax-dot ' + state.type;
    txt.textContent = state.text;
  }

  // ── FPS COUNTER ───────────────────────────────────────────────
  tickFPS(now){
    this._frames++;
    if(now - this._fpsT > 700){
      this.fps = Math.round(this._frames * 1000 / (now - this._fpsT));
      this._frames = 0;
      this._fpsT   = now;
    }
    return this.fps;
  }
}
