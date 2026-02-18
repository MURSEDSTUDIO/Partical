// ═══════════════════════════════════════════════════════════════
//  AXTAR — HAND-TRACKER.JS
//  MediaPipe Hands — 21 Landmarks — Full Gesture Suite
//  Sub-frame interpolation + velocity tracking
// ═══════════════════════════════════════════════════════════════

export class HandTracker {
  constructor(videoEl, onResult){
    this.video    = videoEl;
    this.onResult = onResult;
    this.ready    = false;

    // State
    this.state = {
      present:    false,
      worldX:     0, worldY:     0, worldZ: 0,
      gestureId:  0,
      gestureName:'NONE',
      gestureT:   0,
      fingers:    [],
      landmarks:  [],
      pinchScale: 0,
      swipeX:     0, swipeY: 0,
    };

    // Velocity tracking
    this._prevX   = 0.5;
    this._prevY   = 0.5;
    this._velX    = 0;
    this._velY    = 0;
    this._swipeTimer = 0;
    this._forcedSwipe = false;

    // Sub-frame interpolation
    this._targetX = 0; this._targetY = 0;
    this._smoothX = 0; this._smoothY = 0;
    this._SMOOTH  = 0.35;

    // Gesture hold timer
    this._gestureHold = 0;
    this._lastGesture = 'NONE';

    // Camera & world transform
    this._camZ   = 4.2;
    this._fovY   = 55 * Math.PI / 180;
  }

  // ── INIT ──────────────────────────────────────────────────────
  async init(onStatusUpdate){
    onStatusUpdate?.('LOADING MEDIAPIPE AI MODEL...');

    const hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
    });

    hands.setOptions({
      maxNumHands:             1,
      modelComplexity:         1,
      minDetectionConfidence:  0.72,
      minTrackingConfidence:   0.68,
    });

    hands.onResults(r => this._onHandResults(r));

    onStatusUpdate?.('STARTING CAMERA...');
    this._cam = new Camera(this.video, {
      onFrame: async () => {
        await hands.send({ image: this.video });
      },
      width:  640,
      height: 480,
    });

    await this._cam.start();
    this.ready = true;
    onStatusUpdate?.('TRACKING ACTIVE');
    console.log('[HandTracker] MediaPipe ready — 21-point tracking active');
  }

  // ── SMOOTH UPDATE (call every frame) ─────────────────────────
  update(){
    if(!this.state.present) return;

    // Sub-frame smooth interpolation
    this._smoothX += (this._targetX - this._smoothX) * this._SMOOTH;
    this._smoothY += (this._targetY - this._smoothY) * this._SMOOTH;

    const [wx, wy] = this._toWorld(this._smoothX, this._smoothY);
    this.state.worldX = wx;
    this.state.worldY = wy;

    // Decay swipe timer
    if(this._swipeTimer > 0) this._swipeTimer--;
    else this._forcedSwipe = false;
  }

  // ── MEDIAPIPE CALLBACK ────────────────────────────────────────
  _onHandResults(results){
    const lm = results.multiHandLandmarks?.[0];

    if(!lm){
      this.state.present    = false;
      this.state.gestureId  = 0;
      this.state.gestureName= 'NONE';
      this.state.fingers    = [];
      this.state.landmarks  = [];
      this._gestureHold     = 0;
      this.onResult({ ...this.state, rawFrame: results.image });
      return;
    }

    this.state.present   = true;
    this.state.landmarks = lm;

    // Palm center — weighted average
    const palmX = lm[0].x*0.35 + lm[5].x*0.25 + lm[9].x*0.25 + lm[13].x*0.15;
    const palmY = lm[0].y*0.35 + lm[5].y*0.25 + lm[9].y*0.25 + lm[13].y*0.15;

    // Velocity computation
    this._velX = (this._prevX - palmX) * 60;
    this._velY = (this._prevY - palmY) * 60;
    this._prevX = palmX;
    this._prevY = palmY;

    // Swipe detection — speed threshold
    const swipeSpd = Math.sqrt(this._velX*this._velX + this._velY*this._velY);
    if(swipeSpd > 5.5){
      this._forcedSwipe = true;
      this._swipeTimer  = 15;
      this.state.swipeX = this._velX;
      this.state.swipeY = this._velY;
    }

    // Target for interpolation (mirrored X)
    this._targetX = 1.0 - palmX;
    this._targetY = palmY;
    this.state.worldZ = lm[0].z * 3.0;

    // Gesture detection
    const raw = this._detectGesture(lm);
    const name = this._forcedSwipe ? 'SWIPE' : raw;

    // Gesture hold timer
    if(name === this._lastGesture){
      this._gestureHold++;
    } else {
      this._gestureHold = 0;
      this._lastGesture = name;
    }
    this.state.gestureName = name;
    this.state.gestureId   = this._gestureToId(name);
    this.state.gestureT    = Math.min(this._gestureHold / 60, 1.0);

    // Fingertips in world space
    this.state.fingers = this._buildFingers(lm);

    // Pinch scale [0..1]
    const pinchD = this._dist2D(lm[4], lm[8]);
    const handSz = this._dist2D(lm[0], lm[9]);
    this.state.pinchScale = 1.0 - Math.min(pinchD / (handSz + 0.001), 1.0);

    this.onResult({ ...this.state, rawFrame: results.image });
  }

  // ── GESTURE DETECTION ─────────────────────────────────────────
  _detectGesture(lm){
    // Finger extension: tip Y < pip Y = extended (higher on screen = smaller Y)
    // Indices: thumb=4, index=8, middle=12, ring=16, pinky=20
    // PIP:     thumb=3, index=7, middle=11, ring=15, pinky=19
    // MCP:             index=6, middle=10, ring=14, pinky=18

    const tipY  = [lm[4].y,  lm[8].y,  lm[12].y, lm[16].y, lm[20].y];
    const pipY  = [lm[3].y,  lm[7].y,  lm[11].y, lm[15].y, lm[19].y];
    const mcpY  = [lm[2].y,  lm[6].y,  lm[10].y, lm[14].y, lm[18].y];

    const ext = tipY.map((ty,i) => ty < pipY[i] - 0.012);

    // Thumb: compare X (since thumb extends sideways)
    const thumbExt = lm[4].x < lm[3].x - 0.01;

    const extCount = ext.slice(1).filter(Boolean).length; // fingers only (not thumb)

    // Pinch
    const pinchD = this._dist2D(lm[4], lm[8]);
    const handSz = this._dist2D(lm[0], lm[9]) + 0.001;
    const pNorm  = pinchD / handSz;
    if(pNorm < 0.20) return 'PINCH';

    // Open hand
    if(extCount >= 4) return 'OPEN';

    // Closed fist
    if(extCount === 0 && !thumbExt) return 'FIST';

    // Peace sign ✌️
    if(ext[1] && ext[2] && !ext[3] && !ext[4]) return 'PEACE';

    // Three fingers
    if(!ext[1] && ext[2] && ext[3] && ext[4]) return 'REPEL';

    // Pointing index only
    if(ext[1] && !ext[2] && !ext[3] && !ext[4]) return 'POINT';

    return 'OPEN'; // default
  }

  _gestureToId(name){
    const map = {
      NONE:  0, OPEN: 1, FIST: 2,
      SWIPE: 3, PEACE: 4, PINCH: 5,
      REPEL: 6, POINT: 1,
    };
    return map[name] ?? 0;
  }

  // ── FINGERTIP WORLD POSITIONS ─────────────────────────────────
  _buildFingers(lm){
    return [4,8,12,16,20].map(idx=>{
      const [fx,fy] = this._toWorld(1-lm[idx].x, lm[idx].y);
      return { x:fx, y:fy, z:lm[idx].z*3 };
    });
  }

  // ── SCREEN → WORLD TRANSFORM ─────────────────────────────────
  _toWorld(nx, ny){
    // nx,ny in [0,1], map to world XY at Z=0
    const aspect = window.innerWidth / window.innerHeight;
    const tanH   = Math.tan(this._fovY * 0.5);
    const wx = (nx*2-1) * aspect * tanH * this._camZ;
    const wy = (1-ny*2) * tanH * this._camZ;
    return [wx, wy];
  }

  _dist2D(a, b){
    return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);
  }

  get isReady(){ return this.ready; }
}
