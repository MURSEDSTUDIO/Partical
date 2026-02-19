// ═══════════════════════════════════════════════════════════════
//  MURSED.dev — BUNDLE.JS
//  All modules combined in single file
// ═══════════════════════════════════════════════════════════════

// ── SHADERS ──────────────────────────────────────────────────────
const SHADERS = {

PARTICLE_VERT: `#version 300 es
precision highp float;

in vec3  aPos;
in vec3  aVel;
in float aLife;

uniform mat4  uProj;
uniform mat4  uView;
uniform vec2  uRes;

out vec3  vColor;
out float vAlpha;

void main(){
  vec4 mvPos = uView * vec4(aPos, 1.0);
  gl_Position = uProj * mvPos;

  float speed = length(aVel);
  float depth = clamp((-mvPos.z) / 6.0, 0.3, 1.0);

  vec3 slowColor = vec3(0.0, 0.6, 0.9);
  vec3 fastColor = vec3(0.0, 0.8, 1.0);
  vColor = mix(slowColor, fastColor, min(speed * 2.0, 1.0));

  vAlpha = depth * 0.85;

  float baseSize = 2.8;
  float speedBoost = 1.0 + speed * 1.5;
  gl_PointSize = clamp(
    baseSize * speedBoost * (uRes.y / 800.0) * depth,
    1.0, 10.0
  );
}`,

PARTICLE_FRAG: `#version 300 es
precision mediump float;

in vec3  vColor;
in float vAlpha;

layout(location=0) out vec4 fragColor;
layout(location=1) out vec4 brightColor;

void main(){
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = dot(uv,uv);
  if(r > 1.0) discard;

  float core  = exp(-r * 3.0);
  float glow  = exp(-r * 1.0) * 0.4;
  float alpha = (core + glow) * vAlpha;

  vec3 col = vColor * (1.0 + core * 0.2);
  fragColor = vec4(col, alpha);

  float lum = dot(col, vec3(0.2126,0.7152,0.0722));
  brightColor = vec4(col * max(lum - 0.5, 0.0) * 1.5, alpha);
}`,

QUAD_VERT: `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main(){
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`,

BLUR_FRAG: `#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform vec2 uRes;
in vec2 vUV;
out vec4 fragColor;

void main(){
  vec2 step = uDir / uRes;
  vec4 col = vec4(0.0);
  float weights[5];
  weights[0]=0.227027; weights[1]=0.1945946; weights[2]=0.1216216;
  weights[3]=0.054054; weights[4]=0.016216;
  
  col += texture(uTex, vUV) * weights[0];
  for(int i=1;i<5;i++){
    col += texture(uTex, vUV + step*float(i)) * weights[i];
    col += texture(uTex, vUV - step*float(i)) * weights[i];
  }
  fragColor = col;
}`,

COMPOSITE_FRAG: `#version 300 es
precision mediump float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBloom2;
in vec2 vUV;
out vec4 fragColor;

vec3 aces(vec3 x){
  float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.);
}

void main(){
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 bloom1 = texture(uBloom, vUV).rgb;
  vec3 bloom2 = texture(uBloom2, vUV).rgb;
  
  vec3 col = scene + bloom1 * 0.8 + bloom2 * 0.5;
  col = aces(col * 1.05);
  col = pow(col, vec3(1.0/2.2));
  
  vec2 vig = vUV * 2.0 - 1.0;
  col *= 1.0 - dot(vig,vig)*0.15;
  
  fragColor = vec4(col, 1.0);
}`,

BG_FRAG: `#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 fragColor;
void main(){
  fragColor = vec4(0.0, 0.0, 0.0, 1.0);
}`,

};

// ── PHYSICS ENGINE ───────────────────────────────────────────────
class PhysicsEngine {
  constructor(n){
    this.N = n;
    this.pos    = new Float32Array(n * 3);
    this.vel    = new Float32Array(n * 3);
    this.origin = new Float32Array(n * 3);
    this.life   = new Float32Array(n);
    this.index  = new Float32Array(n);

    this.cfg = {
      DAMPING:   0.96,
      SPRING:    0.025,
      PINCH:     0.65,
      COMPRESS:  0.22,
      EXPLOSION: 28.0,
      MAX_VEL:   0.3,
    };

    this.CHUNK_SIZE = 20000;
    this.currentChunk = 0;
    this.totalChunks = Math.ceil(n / this.CHUNK_SIZE);

    this.hand = {
      present: false,
      x: 0, y: 0, z: 0,
      gesture: 0,
      prevGesture: 0,
      explosionForce: 0,
      fingers: [],
    };

    this.time = 0;
    this._buildSphere();
  }

  _buildSphere(){
    const n = this.N;
    const phi = Math.PI * (3 - Math.sqrt(5));

    for(let i=0;i<n;i++){
      const y = 1 - (i / (n-1)) * 2;
      const rad = Math.sqrt(1 - y*y);
      const theta = phi * i;
      
      const r = 0.75; // HALF SIZE
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

  setHand(state){
    const h = this.hand;
    h.present = state.present;
    h.x = state.worldX || 0;
    h.y = state.worldY || 0;
    h.z = state.worldZ || 0;
    
    const newGesture = state.gestureId || 0;
    
    if(h.prevGesture === 2 && newGesture === 1){
      h.explosionForce = this.cfg.EXPLOSION;
    }
    
    h.gesture = newGesture;
    h.prevGesture = newGesture;
    h.fingers = state.fingers || [];
  }

  tick(){
    this.time += 1;

    if(this.hand.explosionForce > 0){
      this.hand.explosionForce *= 0.90;
      if(this.hand.explosionForce < 0.5) this.hand.explosionForce = 0;
    }

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

      let fx = (ox - px) * cfg.SPRING;
      let fy = (oy - py) * cfg.SPRING;
      let fz = (oz - pz) * cfg.SPRING;

      if(hand.present){
        const dx = hx-px, dy = hy-py, dz = hz-pz;
        const d2 = dx*dx + dy*dy + dz*dz;
        const dist = Math.sqrt(d2) + 0.001;

        if(hand.explosionForce > 0){
          const expDir = [px - hx, py - hy, pz - hz];
          const expDist = Math.sqrt(expDir[0]**2 + expDir[1]**2 + expDir[2]**2) + 0.001;
          const falloff = Math.max(0, 1 - dist/7.0);
          fx += (expDir[0]/expDist) * hand.explosionForce * falloff;
          fy += (expDir[1]/expDist) * hand.explosionForce * falloff;
          fz += (expDir[2]/expDist) * hand.explosionForce * falloff * 0.4;
        }

        if(G === 5){
          const kernel = Math.min(cfg.PINCH / (d2 * 0.4 + 0.06), 2.0);
          fx += dx * kernel;
          fy += dy * kernel;
          fz += dz * kernel * 0.4;

        } else if(G === 2){
          fx -= px * cfg.COMPRESS;
          fy -= py * cfg.COMPRESS;
          fz -= pz * cfg.COMPRESS;
          const ks = Math.min(0.2/dist, 0.3);
          fx += dx*ks; fy += dy*ks;
        }
      }

      vx = (vx + fx) * cfg.DAMPING;
      vy = (vy + fy) * cfg.DAMPING;
      vz = (vz + fz) * cfg.DAMPING;

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

// ── RENDERER ─────────────────────────────────────────────────────
class Renderer {
  constructor(canvas){
    this.canvas = canvas;
    this.W = canvas.width  = window.innerWidth;
    this.H = canvas.height = window.innerHeight;

    this.gl = canvas.getContext('webgl2', {
      antialias:           false,
      premultipliedAlpha:  false,
      powerPreference:     'high-performance',
      preserveDrawingBuffer: false,
    });

    if(!this.gl) throw new Error('WebGL2 not supported');

    const gl = this.gl;

    this.extFloat = gl.getExtension('EXT_color_buffer_float');
    this.extHalf  = gl.getExtension('EXT_color_buffer_half_float');
    this.hasMRT = true;

    this._buildPrograms();
    this._buildFBOs();

    this.camZ    = 4.2;
    this.rotY    = 0;
    this.rotX    = 0;
    this.autoRot = false;

    window.addEventListener('resize', ()=>this._resize());
  }

  _resize(){
    this.W = this.canvas.width  = window.innerWidth;
    this.H = this.canvas.height = window.innerHeight;
    this.gl.viewport(0,0,this.W,this.H);
    this._buildFBOs();
  }

  _mkShader(type, src){
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error(gl.getShaderInfoLog(s));
    return s;
  }

  _mkProg(vsSrc, fsSrc){
    const gl = this.gl;
    const p  = gl.createProgram();
    gl.attachShader(p, this._mkShader(gl.VERTEX_SHADER,   vsSrc));
    gl.attachShader(p, this._mkShader(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS))
      console.error(gl.getProgramInfoLog(p));
    return p;
  }

  _buildPrograms(){
    this.progParticle = this._mkProg(SHADERS.PARTICLE_VERT, SHADERS.PARTICLE_FRAG);
    this.progBg       = this._mkProg(SHADERS.QUAD_VERT, SHADERS.BG_FRAG);
    this.progBlur     = this._mkProg(SHADERS.QUAD_VERT, SHADERS.BLUR_FRAG);
    this.progComp     = this._mkProg(SHADERS.QUAD_VERT, SHADERS.COMPOSITE_FRAG);
  }

  _mkTex(w,h,hdr){
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if(hdr && (this.extFloat||this.extHalf)){
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    }
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return tex;
  }

  _mkFBO(w,h,numTargets,hdr){
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const textures = [];
    const drawBuffers = [];
    for(let i=0;i<numTargets;i++){
      const t = this._mkTex(w,h,hdr);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0+i, gl.TEXTURE_2D, t, 0);
      textures.push(t);
      drawBuffers.push(gl.COLOR_ATTACHMENT0+i);
    }
    if(numTargets > 1) gl.drawBuffers(drawBuffers);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, textures, w, h };
  }

  _buildFBOs(){
    const gl=this.gl;
    const W=this.W, H=this.H;
    const W2=Math.floor(W/2), H2=Math.floor(H/2);
    const W4=Math.floor(W/4), H4=Math.floor(H/4);

    this.fboScene  = this._mkFBO(W, H, 2, true);
    this.fboBlurH1 = this._mkFBO(W2, H2, 1, true);
    this.fboBlurV1 = this._mkFBO(W2, H2, 1, true);
    this.fboBlurH2 = this._mkFBO(W4, H4, 1, true);
    this.fboBlurV2 = this._mkFBO(W4, H4, 1, true);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0,0,W,H);
  }

  setupParticles(physics){
    const gl = this.gl;
    this.N = physics.N;
    this.physics = physics;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const prog = this.progParticle;

    const mkVB = (data, attrib, size)=>{
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      const loc = gl.getAttribLocation(prog, attrib);
      if(loc >= 0){
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      }
      return buf;
    };

    this.bufPos    = mkVB(physics.pos,    'aPos',    3);
    this.bufVel    = mkVB(physics.vel,    'aVel',    3);
    this.bufLife   = mkVB(physics.life,   'aLife',   1);

    gl.bindVertexArray(null);

    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    const qBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qBuf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    [this.progBg, this.progBlur, this.progComp].forEach(p=>{
      const loc = gl.getAttribLocation(p, 'aPos');
      if(loc>=0){
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      }
    });
    gl.bindVertexArray(null);
  }

  _perspective(fovY, ar, near, far){
    const f=1/Math.tan(fovY*0.5), d=far-near;
    return new Float32Array([
      f/ar,0,0,0,
      0,f,0,0,
      0,0,-(far+near)/d,-1,
      0,0,-2*far*near/d,0
    ]);
  }

  _rotY(a){ const c=Math.cos(a),s=Math.sin(a);
    return new Float32Array([c,0,s,0, 0,1,0,0,-s,0,c,0, 0,0,0,1]); }
  _rotX(a){ const c=Math.cos(a),s=Math.sin(a);
    return new Float32Array([1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1]); }
  _trans(tx,ty,tz){
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1]); }

  _mul(a,b){
    const r=new Float32Array(16);
    for(let i=0;i<4;i++)for(let j=0;j<4;j++){
      let s=0; for(let k=0;k<4;k++) s+=a[i+k*4]*b[k+j*4];
      r[i+j*4]=s;
    }
    return r;
  }

  _u(prog, name){ return this.gl.getUniformLocation(prog, name); }

  _bindTex(unit, tex){
    const gl=this.gl;
    gl.activeTexture(gl.TEXTURE0+unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  render(time, handState){
    const gl=this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.physics.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufVel);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.physics.vel);

    const proj = this._perspective(55*Math.PI/180, this.W/this.H, 0.01, 50);
    const view = this._mul(
      this._trans(0,0,-this.camZ),
      this._mul(this._rotX(this.rotX), this._rotY(this.rotY))
    );

    const gestId = handState?.gestureId || 0;
    const handPos= handState?.present
      ? [handState.worldX||0, handState.worldY||0, handState.worldZ||0]
      : [99,99,99];

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScene.fbo);
    gl.viewport(0,0,this.W,this.H);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(this.progBg);
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(this.progParticle);

    gl.uniformMatrix4fv(this._u(this.progParticle,'uProj'), false, proj);
    gl.uniformMatrix4fv(this._u(this.progParticle,'uView'), false, view);
    gl.uniform2f(this._u(this.progParticle,'uRes'), this.W, this.H);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.N);
    gl.bindVertexArray(null);

    gl.disable(gl.BLEND);
    this._blurPass(this.fboScene.textures[1], this.fboBlurH1, [1,0]);
    this._blurPass(this.fboBlurH1.textures[0], this.fboBlurV1, [0,1]);
    this._blurPass(this.fboBlurV1.textures[0], this.fboBlurH2, [1,0]);
    this._blurPass(this.fboBlurH2.textures[0], this.fboBlurV2, [0,1]);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0,0,this.W,this.H);
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.progComp);

    this._bindTex(0, this.fboScene.textures[0]);
    this._bindTex(1, this.fboBlurV1.textures[0]);
    this._bindTex(2, this.fboBlurV2.textures[0]);

    gl.uniform1i(this._u(this.progComp,'uScene'), 0);
    gl.uniform1i(this._u(this.progComp,'uBloom'),  1);
    gl.uniform1i(this._u(this.progComp,'uBloom2'), 2);

    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  _blurPass(srcTex, dstFBO, dir){
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFBO.fbo);
    gl.viewport(0,0,dstFBO.w, dstFBO.h);
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.progBlur);
    this._bindTex(0, srcTex);
    gl.uniform1i(this._u(this.progBlur,'uTex'), 0);
    gl.uniform2fv(this._u(this.progBlur,'uDir'), dir);
    gl.uniform2f(this._u(this.progBlur,'uRes'), dstFBO.w, dstFBO.h);
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}

// ── HAND TRACKER ─────────────────────────────────────────────────
class HandTracker {
  constructor(videoEl, onResult){
    this.video    = videoEl;
    this.onResult = onResult;
    this.ready    = false;

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

    this._prevX   = 0.5;
    this._prevY   = 0.5;
    this._velX    = 0;
    this._velY    = 0;
    this._swipeTimer = 0;
    this._forcedSwipe = false;

    this._targetX = 0; this._targetY = 0;
    this._smoothX = 0; this._smoothY = 0;
    this._SMOOTH  = 0.35;

    this._gestureHold = 0;
    this._lastGesture = 'NONE';

    this._camZ   = 4.2;
    this._fovY   = 55 * Math.PI / 180;
  }

  async init(onStatusUpdate){
    onStatusUpdate?.('LOADING AI MODEL...');

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
    onStatusUpdate?.('READY');
  }

  update(){
    if(!this.state.present) return;

    this._smoothX += (this._targetX - this._smoothX) * this._SMOOTH;
    this._smoothY += (this._targetY - this._smoothY) * this._SMOOTH;

    const [wx, wy] = this._toWorld(this._smoothX, this._smoothY);
    this.state.worldX = wx;
    this.state.worldY = wy;

    if(this._swipeTimer > 0) this._swipeTimer--;
    else this._forcedSwipe = false;
  }

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

    const palmX = lm[0].x*0.35 + lm[5].x*0.25 + lm[9].x*0.25 + lm[13].x*0.15;
    const palmY = lm[0].y*0.35 + lm[5].y*0.25 + lm[9].y*0.25 + lm[13].y*0.15;

    this._velX = (this._prevX - palmX) * 60;
    this._velY = (this._prevY - palmY) * 60;
    this._prevX = palmX;
    this._prevY = palmY;

    const swipeSpd = Math.sqrt(this._velX*this._velX + this._velY*this._velY);
    if(swipeSpd > 5.5){
      this._forcedSwipe = true;
      this._swipeTimer  = 15;
      this.state.swipeX = this._velX;
      this.state.swipeY = this._velY;
    }

    this._targetX = 1.0 - palmX;
    this._targetY = palmY;
    this.state.worldZ = lm[0].z * 3.0;

    const raw = this._detectGesture(lm);
    const name = this._forcedSwipe ? 'SWIPE' : raw;

    if(name === this._lastGesture){
      this._gestureHold++;
    } else {
      this._gestureHold = 0;
      this._lastGesture = name;
    }
    this.state.gestureName = name;
    this.state.gestureId   = this._gestureToId(name);
    this.state.gestureT    = Math.min(this._gestureHold / 60, 1.0);

    this.state.fingers = this._buildFingers(lm);

    const pinchD = this._dist2D(lm[4], lm[8]);
    const handSz = this._dist2D(lm[0], lm[9]);
    this.state.pinchScale = 1.0 - Math.min(pinchD / (handSz + 0.001), 1.0);

    this.onResult({ ...this.state, rawFrame: results.image });
  }

  _detectGesture(lm){
    const tip=[4,8,12,16,20];
    const pip=[3,7,11,15,19];

    const thumbOpen = lm[4].x < lm[3].x;
    const ext = tip.slice(1).map((t,i)=>lm[t].y < lm[pip[i+1]].y - 0.015);

    const pinchD = Math.hypot(lm[4].x-lm[8].x, lm[4].y-lm[8].y);
    const handSz = Math.hypot(lm[0].x-lm[9].x, lm[0].y-lm[9].y);
    const pnorm  = pinchD / (handSz||0.01);

    const extCount = ext.filter(Boolean).length;

    if(pnorm < 0.22)                       return 'PINCH';
    if(extCount >= 4)                      return 'OPEN';
    if(extCount === 0)                     return 'FIST';
    if(ext[0]&&ext[1]&&!ext[2]&&!ext[3])  return 'PEACE';
    return 'OPEN';
  }

  _gestureToId(name){
    const map = {
      NONE:  0, OPEN: 1, FIST: 2,
      SWIPE: 3, PEACE: 4, PINCH: 5,
      REPEL: 6, POINT: 1,
    };
    return map[name] ?? 0;
  }

  _buildFingers(lm){
    return [4,8,12,16,20].map(idx=>{
      const [fx,fy] = this._toWorld(1-lm[idx].x, lm[idx].y);
      return { x:fx, y:fy, z:lm[idx].z*3 };
    });
  }

  _toWorld(nx, ny){
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

// ── UI ───────────────────────────────────────────────────────────
class UI {
  constructor(){
    this._buildDOM();
    this._buildHandCanvas();

    this.fps       = 60;
    this._frames   = 0;
    this._fpsT     = 0;

    this._curGesture  = 'NONE';
    this._gestureAnim = 0;
    this._cornerT = 0;

    window.addEventListener('resize', ()=>this._resizeHandCanvas());
  }

  _buildDOM(){
    document.body.insertAdjacentHTML('beforeend', `
    <div id="ax-hud">
      <div class="ax-corner ax-tl"></div>
      <div class="ax-corner ax-tr"></div>
      <div class="ax-corner ax-bl"></div>
      <div class="ax-corner ax-br"></div>

      <div class="ax-title-block">
        <div class="ax-title">MURSED<span class="ax-title-dev">.dev</span></div>
        <div class="ax-title-sub">GESTURE PARTICLE SYSTEM — PROFESSIONAL EDITION</div>
        <div class="ax-title-line"></div>
      </div>

      <div class="ax-gesture-center" id="ax-gc">
        <div class="ax-gc-ring" id="ax-gc-ring"></div>
        <div class="ax-gc-name" id="ax-gc-name">AWAITING HAND</div>
        <div class="ax-gc-bar"><div class="ax-gc-fill" id="ax-gc-fill"></div></div>
      </div>

      <div class="ax-stats" id="ax-stats">
        <div class="ax-stat">PARTICLES <span class="ax-val" id="ax-s-n">—</span></div>
        <div class="ax-stat">FPS <span class="ax-val" id="ax-s-fps">—</span></div>
        <div class="ax-stat">FORMATION <span class="ax-val" id="ax-s-form">SPHERE</span></div>
        <div class="ax-stat">DEPTH <span class="ax-val" id="ax-s-depth">—</span></div>
        <div class="ax-stat">VELOCITY <span class="ax-val" id="ax-s-vel">—</span></div>
      </div>

      <div class="ax-cam-wrap" id="ax-cam-wrap">
        <div class="ax-cam-label">HAND TRACKING</div>
        <div class="ax-cam-inner">
          <canvas id="ax-hand"></canvas>
        </div>
        <div class="ax-cam-scan"></div>
      </div>

      <div class="ax-status-row">
        <div class="ax-dot" id="ax-dot"></div>
        <span id="ax-status-txt">INITIALIZING</span>
      </div>

      <div class="ax-guide">
        <div class="ax-gi">ATTRACT</div>
        <div class="ax-gi">GRAB</div>
        <div class="ax-gi">COMPRESS</div>
        <div class="ax-gi">SCATTER</div>
        <div class="ax-gi">WAVE</div>
        <div class="ax-gi">REPEL</div>
      </div>

      <div class="ax-watermark">MURSED.dev</div>
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
    .ax-title-dev {
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
      margin:0 auto 12px;
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
      background:rgba(0,0,0,0.6);
    }
    .ax-cam-inner canvas {
      display:block;
      width:100%;
      background:rgba(0,0,0,0.6);
    }
    #ax-hand { transform:scaleX(-1); }
    .ax-cam-scan {
      position:absolute; inset:0;
      background:repeating-linear-gradient(
        0deg, transparent, transparent 3px,
        rgba(0,212,255,0.03) 3px, rgba(0,212,255,0.03) 4px
      );
      pointer-events:none;
      border-radius:6px;
    }

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

    .ax-guide {
      position:absolute;
      bottom:22px; left:50%; transform:translateX(-50%);
      display:flex; gap:clamp(10px,2vw,22px);
      font-size:8px; letter-spacing:1px;
      color:rgba(0,212,255,0.28);
    }
    .ax-gi { text-align:center; }

    .ax-watermark {
      position:absolute;
      bottom:22px; right:22px;
      font-size:9px;
      letter-spacing:3px;
      color:rgba(0,212,255,0.35);
      opacity:0;
      animation: ax-watermark-fade 2s 1s forwards;
    }
    @keyframes ax-watermark-fade {
      to { opacity:1; }
    }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  _buildHandCanvas(){
    setTimeout(()=>{
      this._hand = document.getElementById('ax-hand');
      this._resizeHandCanvas();
    }, 100);
  }

  _resizeHandCanvas(){
    const wrap = document.getElementById('ax-cam-wrap');
    if(!wrap||!this._hand) return;
    const w = wrap.offsetWidth;
    const h = Math.round(w * 0.75);
    this._hand.width = w;
    this._hand.height = h;
    this._hCtx = this._hand.getContext('2d');
  }

  static CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],
    [5,9],[9,13],[13,17],[5,17]
  ];
  static TIPS = [4,8,12,16,20];

  drawHand(lm){
    if(!this._hCtx||!this._hand) return;
    const cw=this._hand.width, ch=this._hand.height;
    this._hCtx.clearRect(0,0,cw,ch);
    if(!lm||!lm.length) return;

    const px = i => lm[i].x * cw;
    const py = i => lm[i].y * ch;

    UI.CONNECTIONS.forEach(([a,b])=>{
      this._hCtx.beginPath();
      this._hCtx.moveTo(px(a), py(a));
      this._hCtx.lineTo(px(b), py(b));
      this._hCtx.strokeStyle = 'rgba(0,212,255,0.6)';
      this._hCtx.lineWidth   = 1.3;
      this._hCtx.stroke();
    });

    lm.forEach((p,i)=>{
      const isTip = UI.TIPS.includes(i);
      const x = p.x*cw, y = p.y*ch;
      if(isTip){
        this._hCtx.beginPath();
        this._hCtx.arc(x,y,7,0,Math.PI*2);
        this._hCtx.strokeStyle='rgba(0,255,200,0.2)';
        this._hCtx.lineWidth=1;
        this._hCtx.stroke();
      }
      this._hCtx.beginPath();
      this._hCtx.arc(x,y, isTip?3.5:2, 0, Math.PI*2);
      this._hCtx.fillStyle = isTip ? '#00ffcc' : 'rgba(0,180,255,0.9)';
      this._hCtx.fill();
    });

    const pcx=(lm[0].x+lm[9].x)/2*cw;
    const pcy=(lm[0].y+lm[9].y)/2*ch;
    this._hCtx.beginPath();
    this._hCtx.arc(pcx,pcy,4,0,Math.PI*2);
    this._hCtx.fillStyle='rgba(255,200,0,0.85)';
    this._hCtx.fill();
  }

  static GESTURE_DATA = {
    NONE:  { name:'SHOW YOUR HAND',   color:'rgba(0,212,255,0.35)' },
    OPEN:  { name:'OPEN — ATTRACT',   color:'#00d4ff' },
    FIST:  { name:'FIST — COMPRESS',  color:'#ff6644' },
    SWIPE: { name:'SWIPE — SCATTER',  color:'#ffcc00' },
    PEACE: { name:'PEACE — WAVE',     color:'#aa88ff' },
    PINCH: { name:'PINCH — GRAB',     color:'#00ffcc' },
    REPEL: { name:'REPEL — PUSH',     color:'#ff88aa' },
    POINT: { name:'POINT — ATTRACT',  color:'#88ccff' },
  };

  updateGesture(name, holdT){
    const d = UI.GESTURE_DATA[name] || UI.GESTURE_DATA.NONE;
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

// ── MAIN ─────────────────────────────────────────────────────────
const N = 15000; // HALF - 15K particles

function buildLoader(){
  const el = document.createElement('div');
  el.id = 'ax-loader';
  el.innerHTML = `
    <div style="position:fixed;inset:0;background:#000;display:flex;align-items:center;justify-content:center;z-index:1000;font-family:'Orbitron',sans-serif;transition:opacity 0.5s">
      <div style="text-align:center">
        <div style="font-size:clamp(32px,6vw,48px);font-weight:900;letter-spacing:8px;color:#00d4ff;text-shadow:0 0 30px #00d4ff">MURSED<span style="color:#00ffcc">.dev</span></div>
        <div style="font-size:10px;letter-spacing:3px;color:rgba(0,212,255,0.5);margin-top:16px" id="axl-status">LOADING...</div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function hideLoader(el){
  el.style.opacity = '0';
  setTimeout(()=>el.remove(), 500);
}

async function main(){
  const loader = buildLoader();

  try {
    const ui = new UI();
    const physics = new PhysicsEngine(N);
    const canvas   = document.getElementById('ax-canvas');
    const renderer = new Renderer(canvas);
    renderer.setupParticles(physics);

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
    hideLoader(loader);
    ui.setStatus({ type:'on', text:'READY' });

    let lastStatsUpdate = 0;

    function loop(now){
      requestAnimationFrame(loop);
      tracker.update();
      physics.tick();
      renderer.render(now * 0.001, handState);

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
