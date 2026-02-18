// ═══════════════════════════════════════════════════════════════
//  MURSED.dev — PHYSICS.JS — OPTIMIZED
//  Stable sphere, simple gestures, fast performance
// ═══════════════════════════════════════════════════════════════

export class PhysicsEngine {
  constructor(n){
    this.N = n;

    this.pos    = new Float32Array(n * 3);
    this.vel    = new Float32Array(n * 3);
    this.origin = new Float32Array(n * 3);
    this.life   = new Float32Array(n);
    this.index  = new Float32Array(n);

    // Optimized physics config
    this.cfg = {
      DAMPING:   0.96,
      SPRING:    0.025,
      PINCH:     0.65,
      COMPRESS:  0.22,
      EXPLOSION: 28.0,
      MAX_VEL:   0.3,
    };

    // Fast chunked processing
    this.CHUNK_SIZE = 20000;
    this.currentChunk = 0;
    this.totalChunks = Math.ceil(n / this.CHUNK_SIZE);

    // Hand state - SIMPLE
    this.hand = {
      present: false,
      x: 0, y: 0, z: 0,
      gesture: 0,  // 0=none, 1=pinch, 2=fist
      prevGesture: 0,
      explosionForce: 0,
      fingers: [],
    };

    this.time = 0;
    this._buildSphere();
  }

  // ── PERFECT SPHERE (dense, uniform) ─────────────────────────
  _buildSphere(){
    const n = this.N;
    const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle

    for(let i=0;i<n;i++){
      const y = 1 - (i / (n-1)) * 2;
      const rad = Math.sqrt(1 - y*y);
      const theta = phi * i;
      
      const r = 1.5; // sphere radius
      const x = Math.cos(theta) * rad * r;
      const yy = y * r;
      const z = Math.sin(theta) * rad * r;

      this.origin[i*3]   = x;
      this.origin[i*3+1] = yy;
      this.origin[i*3+2] = z;
      
      this.pos[i*3]   = x;
      this.pos[i*3+1] = yy;
      this.pos[i*3+2] = z;
      
      this.life[i]  = Math.random();
      this.index[i] = i / n;
    }
  }

  // ── HAND UPDATE ──────────────────────────────────────────────
  setHand(state){
    const h = this.hand;
    h.present = state.present;
    h.x = state.worldX || 0;
    h.y = state.worldY || 0;
    h.z = state.worldZ || 0;
    
    const newGesture = state.gestureId || 0;
    
    // Detect fist-to-open explosion
    if(h.prevGesture === 2 && newGesture === 1){
      h.explosionForce = this.cfg.EXPLOSION;
    }
    
    h.gesture = newGesture;
    h.prevGesture = newGesture;
    h.fingers = state.fingers || [];
  }

  // ── PHYSICS TICK ─────────────────────────────────────────────
  tick(){
    this.time += 1;

    // Decay explosion
    if(this.hand.explosionForce > 0){
      this.hand.explosionForce *= 0.90;
      if(this.hand.explosionForce < 0.5) this.hand.explosionForce = 0;
    }

    // Process chunk
    const start = this.currentChunk * this.CHUNK_SIZE;
    const end   = Math.min(start + this.CHUNK_SIZE, this.N);
    this._processChunk(start, end);
    this.currentChunk = (this.currentChunk + 1) % this.totalChunks;
  }

  _processChunk(start, end){
    const { pos, vel, origin, cfg, hand } = this;
    const G  = hand.gesture;
    const hx = hand.x, hy = hand.y, hz = hand.z;

    for(let i = start; i < end; i++){
      const ix=i*3, iy=ix+1, iz=ix+2;
      let px=pos[ix], py=pos[iy], pz=pos[iz];
      let vx=vel[ix], vy=vel[iy], vz=vel[iz];
      const ox=origin[ix], oy=origin[iy], oz=origin[iz];

      // Spring to origin - STRONG (stable sphere)
      let fx = (ox - px) * cfg.SPRING;
      let fy = (oy - py) * cfg.SPRING;
      let fz = (oz - pz) * cfg.SPRING;

      if(hand.present){
        const dx = hx-px, dy = hy-py, dz = hz-pz;
        const d2 = dx*dx + dy*dy + dz*dz;
        const dist = Math.sqrt(d2) + 0.001;

        // Explosion from fist-open
        if(hand.explosionForce > 0){
          const expDir = [px - hx, py - hy, pz - hz];
          const expDist = Math.sqrt(expDir[0]**2 + expDir[1]**2 + expDir[2]**2) + 0.001;
          const falloff = Math.max(0, 1 - dist/7.0);
          fx += (expDir[0]/expDist) * hand.explosionForce * falloff;
          fy += (expDir[1]/expDist) * hand.explosionForce * falloff;
          fz += (expDir[2]/expDist) * hand.explosionForce * falloff * 0.4;
        }

        if(G === 5){ // PINCH - stretch from hand
          const kernel = Math.min(cfg.PINCH / (d2 * 0.4 + 0.06), 2.0);
          fx += dx * kernel;
          fy += dy * kernel;
          fz += dz * kernel * 0.4;

        } else if(G === 2){ // FIST - compress
          fx -= px * cfg.COMPRESS;
          fy -= py * cfg.COMPRESS;
          fz -= pz * cfg.COMPRESS;
          const ks = Math.min(0.2/dist, 0.3);
          fx += dx*ks; fy += dy*ks;
        }
      }

      // Verlet integration
      vx = (vx + fx) * cfg.DAMPING;
      vy = (vy + fy) * cfg.DAMPING;
      vz = (vz + fz) * cfg.DAMPING;

      // Velocity cap
      const spd2 = vx*vx + vy*vy + vz*vz;
      if(spd2 > cfg.MAX_VEL*cfg.MAX_VEL){
        const s = cfg.MAX_VEL / Math.sqrt(spd2);
        vx*=s; vy*=s; vz*=s;
      }

      pos[ix]=px+vx; pos[iy]=py+vy; pos[iz]=pz+vz;
      vel[ix]=vx;    vel[iy]=vy;    vel[iz]=vz;
    }
  }

  get progress(){ return this.currentChunk / this.totalChunks; }
}
