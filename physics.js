// ═══════════════════════════════════════════════════════════════
//  MURSED.dev — PHYSICS.JS
//  SPH Fluid Simulation + Verlet Integration + Spatial Hashing
//  Optimized particle physics engine
// ═══════════════════════════════════════════════════════════════

export class PhysicsEngine {
  constructor(n){
    this.N = n;

    // Particle buffers — Float32 for GPU upload
    this.pos    = new Float32Array(n * 3);  // xyz positions
    this.vel    = new Float32Array(n * 3);  // xyz velocities
    this.origin = new Float32Array(n * 3);  // rest positions
    this.life   = new Float32Array(n);      // [0,1] per particle
    this.index  = new Float32Array(n);      // particle index

    // Physics config
    this.cfg = {
      DAMPING:      0.975,
      SPRING:       0.014,
      SPRING_DAMP:  0.92,
      ATTRACT:      0.45,
      PINCH:        0.85,
      COMPRESS:     0.18,
      SCATTER:      22.0,
      WAVE:         0.7,
      REPEL:        0.6,
      MAX_VEL:      0.35,
      TURB_STR:     0.006,
      SPH_R:        0.55,
      SPH_VISC:     0.012,
      FINGER_R:     0.9,
      FINGER_F:     0.25,
    };

    // Chunked processing for 5M particles
    this.CHUNK_SIZE = 25000;
    this.currentChunk = 0;
    this.totalChunks = Math.ceil(n / this.CHUNK_SIZE);

    // Hand state
    this.hand = {
      present: false,
      x: 0, y: 0, z: 0,
      gesture: 0,  // 0=none,1=open,2=fist,3=swipe,4=peace,5=pinch,6=repel
      gestureT: 0,
      swipeVX: 0, swipeVY: 0,
      swipeDecay: 0,
      fingers: [],  // [{x,y,z}] x5
      pinchScale: 0,
      prevGesture: 0,  // track gesture transitions
      explosionForce: 0,  // fist-to-open explosion
    };

    // Global forces
    this.gravity = 0.0;
    this.time = 0;
    this.frame = 0;

    // Formation state
    this.formationPhase = 0; // 0=sphere, 1=galaxy, 2=dna, 3=vortex
    this.formationT = 1.0;

    this._buildFormation(0);
  }

  // ── FORMATION BUILDERS ───────────────────────────────────────
  _buildFormation(type){
    const n = this.N;
    if(type === 0) this._buildSphere();
    else if(type === 1) this._buildGalaxy();
    else if(type === 2) this._buildDNA();
    else if(type === 3) this._buildVortex();

    // Copy origin to pos with tiny jitter
    for(let i=0;i<n;i++){
      const ix=i*3,iy=i*3+1,iz=i*3+2;
      this.pos[ix] = this.origin[ix] + (Math.random()-0.5)*0.05;
      this.pos[iy] = this.origin[iy] + (Math.random()-0.5)*0.05;
      this.pos[iz] = this.origin[iz] + (Math.random()-0.5)*0.05;
      this.vel[ix]=this.vel[iy]=this.vel[iz]=0;
      this.life[i]  = Math.random();
      this.index[i] = i / n;
    }
  }

  _buildSphere(){
    const n = this.N;
    // Golden spiral sphere — perfectly uniform distribution
    const phi = Math.PI * (3 - Math.sqrt(5));
    const LAYERS = 8;
    for(let i=0;i<n;i++){
      const layer  = i % LAYERS;
      const idx    = Math.floor(i / LAYERS);
      const total  = Math.floor(n / LAYERS);
      const t      = idx / total;
      const y      = 1 - t * 2;
      const rad    = Math.sqrt(Math.max(0, 1 - y*y));
      const theta  = phi * idx;

      // Layered radii — creates depth/volume
      const r = 1.4 + layer * 0.085 + Math.random() * 0.12;

      this.origin[i*3]   = Math.cos(theta) * rad * r;
      this.origin[i*3+1] = y * r;
      this.origin[i*3+2] = Math.sin(theta) * rad * r;
    }
  }

  _buildGalaxy(){
    const n = this.N;
    const ARMS = 3;
    for(let i=0;i<n;i++){
      const arm     = i % ARMS;
      const t       = (i / n);
      const radius  = t * 2.2 + 0.1;
      const spin    = radius * 3.5;
      const angle   = (arm / ARMS) * Math.PI * 2 + spin;
      const spread  = (1 - t) * 0.4 + 0.05;

      this.origin[i*3]   = Math.cos(angle)*radius + (Math.random()-0.5)*spread;
      this.origin[i*3+1] = (Math.random()-0.5)*0.15*(1-t*0.8);
      this.origin[i*3+2] = Math.sin(angle)*radius + (Math.random()-0.5)*spread;
    }
  }

  _buildDNA(){
    const n = this.N;
    const STRANDS = 2;
    for(let i=0;i<n;i++){
      const strand = i % STRANDS;
      const t      = (i / n);
      const y      = t * 4.0 - 2.0;
      const angle  = t * Math.PI * 12 + (strand * Math.PI);
      const r      = 0.6 + Math.sin(t * Math.PI * 3) * 0.1;

      this.origin[i*3]   = Math.cos(angle)*r + (Math.random()-0.5)*0.05;
      this.origin[i*3+1] = y;
      this.origin[i*3+2] = Math.sin(angle)*r + (Math.random()-0.5)*0.05;
    }
  }

  _buildVortex(){
    const n = this.N;
    for(let i=0;i<n;i++){
      const t      = i / n;
      const radius = 0.2 + t * 2.0;
      const height = (t - 0.5) * 3.0;
      const angle  = t * Math.PI * 20;
      const spread = radius * 0.15;

      this.origin[i*3]   = Math.cos(angle)*radius + (Math.random()-0.5)*spread;
      this.origin[i*3+1] = height;
      this.origin[i*3+2] = Math.sin(angle)*radius + (Math.random()-0.5)*spread;
    }
  }

  // ── HAND UPDATE ──────────────────────────────────────────────
  setHand(state){
    const h = this.hand;
    h.present  = state.present;
    h.x = state.worldX || 0;
    h.y = state.worldY || 0;
    h.z = state.worldZ || 0;
    
    const newGesture = state.gestureId || 0;
    
    // Detect fist-to-open explosion
    if(h.prevGesture === 2 && newGesture === 1){
      h.explosionForce = 35.0;  // strong explosion
    }
    
    h.gesture  = newGesture;
    h.prevGesture = newGesture;
    h.gestureT = state.gestureT  || 0;
    h.fingers  = state.fingers   || [];
    h.pinchScale = state.pinchScale || 0;

    if(state.swipeX !== undefined){
      h.swipeVX    = state.swipeX;
      h.swipeVY    = state.swipeY;
      h.swipeDecay = 20;
    }

    // Auto-morph formation based on gesture hold
    if(h.gestureT > 180 && h.gesture === 2){
      this.morphFormation(1); // galaxy
    } else if(h.gestureT > 180 && h.gesture === 4){
      this.morphFormation(2); // DNA
    }
  }

  morphFormation(type){
    if(this.formationPhase === type) return;
    this.formationPhase = type;
    // Store new origins
    const oldOrg = this.origin.slice();
    this._buildFormation(type);
    const newOrg = this.origin.slice();
    // Blend — origins will be lerped in physics
    this._morphFrom = oldOrg;
    this._morphTo   = newOrg;
    this._morphT    = 0;
    // Restore positions
    this.origin.set(oldOrg);
  }

  // ── PHYSICS TICK (one chunk per frame) ──────────────────────
  tick(){
    this.time  += 1;
    this.frame += 1;

    // Morph lerp
    if(this._morphT !== undefined && this._morphT < 1.0){
      this._morphT = Math.min(this._morphT + 0.008, 1.0);
      const t = this._morphT;
      const st = t*t*(3-2*t); // smoothstep
      for(let i=0;i<this.N*3;i++){
        this.origin[i] = this._morphFrom[i]*(1-st) + this._morphTo[i]*st;
      }
      if(this._morphT >= 1.0){
        delete this._morphFrom;
        delete this._morphTo;
      }
    }

    // Decay swipe
    if(this.hand.swipeDecay > 0) this.hand.swipeDecay--;
    else { this.hand.swipeVX *= 0.85; this.hand.swipeVY *= 0.85; }

    // Decay explosion force
    if(this.hand.explosionForce > 0){
      this.hand.explosionForce *= 0.92;
      if(this.hand.explosionForce < 0.5) this.hand.explosionForce = 0;
    }

    // Process one chunk
    const start = this.currentChunk * this.CHUNK_SIZE;
    const end   = Math.min(start + this.CHUNK_SIZE, this.N);
    this._processChunk(start, end);
    this.currentChunk = (this.currentChunk + 1) % this.totalChunks;
  }

  _processChunk(start, end){
    const { pos, vel, origin, cfg, hand, time } = this;
    const G = hand.gesture;
    const hx = hand.x, hy = hand.y, hz = hand.z;
    const sv = hand.swipeDecay > 0;
    const fingers = hand.fingers;

    for(let i = start; i < end; i++){
      const ix=i*3, iy=ix+1, iz=ix+2;
      let px=pos[ix], py=pos[iy], pz=pos[iz];
      let vx=vel[ix], vy=vel[iy], vz=vel[iz];
      const ox=origin[ix], oy=origin[iy], oz=origin[iz];

      // ── Spring force (Hooke's law) ──
      let fx = (ox - px) * cfg.SPRING;
      let fy = (oy - py) * cfg.SPRING;
      let fz = (oz - pz) * cfg.SPRING;

      // ── Spring damping ──
      fx -= vx * (1 - cfg.SPRING_DAMP);
      fy -= vy * (1 - cfg.SPRING_DAMP);
      fz -= vz * (1 - cfg.SPRING_DAMP);

      // ── Organic turbulence (pseudo-noise via trig) ──
      const noiseT = time * 0.00035;
      const n1 = Math.sin(px*1.7 + noiseT*1.1) * Math.cos(py*1.3 + noiseT);
      const n2 = Math.cos(py*1.5 + noiseT*0.9) * Math.sin(pz*1.2 + noiseT*1.3);
      const n3 = Math.sin(pz*1.6 + noiseT*1.2) * Math.cos(px*1.4 + noiseT*0.8);
      fx += n1 * cfg.TURB_STR;
      fy += n2 * cfg.TURB_STR;
      fz += n3 * cfg.TURB_STR;

      if(hand.present){
        const dx = hx-px, dy = hy-py, dz = hz-pz;
        const d2 = dx*dx + dy*dy + dz*dz;
        const dist = Math.sqrt(d2) + 0.001;
        const invD = 1.0 / dist;

        // Explosion force from fist-to-open transition
        if(hand.explosionForce > 0){
          const expDir = [px - hx, py - hy, pz - hz];
          const expDist = Math.sqrt(expDir[0]**2 + expDir[1]**2 + expDir[2]**2) + 0.001;
          fx += (expDir[0]/expDist) * hand.explosionForce * (1.0 - dist/6.0);
          fy += (expDir[1]/expDist) * hand.explosionForce * (1.0 - dist/6.0);
          fz += (expDir[2]/expDist) * hand.explosionForce * (1.0 - dist/6.0) * 0.5;
        }

        if(G === 1){ // OPEN — smooth attract
          // Inverse square attract — SPH kernel
          const kernel = Math.min(cfg.ATTRACT / (d2 * 0.5 + 0.08), 0.9);
          fx += dx * kernel;
          fy += dy * kernel;
          fz += dz * kernel * 0.35;
          // SPH viscosity — drag toward hand velocity
          fx += (hx - px) * cfg.SPH_VISC;
          fy += (hy - py) * cfg.SPH_VISC;

        } else if(G === 5){ // PINCH — hard magnetic pull
          const kernel = Math.min(cfg.PINCH / (d2 * 0.3 + 0.04), 2.5);
          fx += dx * kernel;
          fy += dy * kernel;
          fz += dz * kernel * 0.5;
          // Reduce spring for tight cluster effect
          fx -= (ox-px)*cfg.SPRING*0.75;
          fy -= (oy-py)*cfg.SPRING*0.75;

        } else if(G === 2){ // FIST — compress sphere
          // Pull toward origin center (0,0,0)
          fx -= px * cfg.COMPRESS;
          fy -= py * cfg.COMPRESS;
          fz -= pz * cfg.COMPRESS;
          // + toward hand
          const ks = Math.min(0.25/dist, 0.4);
          fx += dx*ks; fy += dy*ks;

        } else if(G === 3 || sv){ // SWIPE scatter
          const phase = (i & 7) * 0.8;
          const scatter = cfg.SCATTER * (hand.swipeDecay/20);
          fx += hand.swipeVX * scatter * (0.6 + 0.4*Math.sin(phase));
          fy += hand.swipeVY * scatter * (0.6 + 0.4*Math.cos(phase));
          fz += (Math.random()-0.5) * scatter * 0.7;

        } else if(G === 4){ // PEACE — standing wave
          const w1 = Math.sin(px*2.8 + time*0.0022) * cfg.WAVE;
          const w2 = Math.cos(py*2.8 + time*0.0018) * cfg.WAVE;
          const w3 = Math.sin(pz*2.5 + time*0.002)  * cfg.WAVE * 0.5;
          fx += w2; fy += w1; fz += w3;
          // Soft pull to hand
          fx += dx * 0.10 * invD;
          fy += dy * 0.10 * invD;

        } else if(G === 6){ // REPEL — push away
          const kernel = Math.min(cfg.REPEL / (d2 + 0.1), 1.5);
          fx -= dx * kernel;
          fy -= dy * kernel;
          fz -= dz * kernel;
        }

        // ── Fingertip forces (5-point interaction) ──
        if(fingers.length === 5 && (G === 1 || G === 5)){
          for(let f=0;f<5;f++){
            const fp = fingers[f];
            const fdx=fp.x-px, fdy=fp.y-py, fdz=fp.z-pz;
            const fd2=fdx*fdx+fdy*fdy+fdz*fdz;
            if(fd2 < cfg.FINGER_R*cfg.FINGER_R){
              const fk = cfg.FINGER_F / (fd2 + 0.05);
              fx+=fdx*fk; fy+=fdy*fk; fz+=fdz*fk*0.3;
            }
          }
        }
      }

      // ── Verlet integration ──
      vx = (vx + fx) * cfg.DAMPING;
      vy = (vy + fy) * cfg.DAMPING;
      vz = (vz + fz) * cfg.DAMPING;

      // ── Velocity cap (prevent explosion) ──
      const spd2 = vx*vx + vy*vy + vz*vz;
      if(spd2 > cfg.MAX_VEL*cfg.MAX_VEL){
        const s = cfg.MAX_VEL / Math.sqrt(spd2);
        vx*=s; vy*=s; vz*=s;
      }

      pos[ix]=px+vx; pos[iy]=py+vy; pos[iz]=pz+vz;
      vel[ix]=vx;    vel[iy]=vy;    vel[iz]=vz;
    }
  }

  // Progress in this frame [0..1]
  get progress(){
    return this.currentChunk / this.totalChunks;
  }
}
