// ═══════════════════════════════════════════════════════════════
//  MURSED.dev — RENDERER.JS
//  WebGL2 Full Pipeline — MRT + Multi-pass Bloom + ACES Tone Map
// ═══════════════════════════════════════════════════════════════

import { SHADERS } from './shaders.js';

export class Renderer {
  constructor(canvas){
    this.canvas = canvas;
    this.W = canvas.width  = window.innerWidth;
    this.H = canvas.height = window.innerHeight;

    // Try WebGL2 first
    this.gl = canvas.getContext('webgl2', {
      antialias:           false,
      premultipliedAlpha:  false,
      powerPreference:     'high-performance',
      preserveDrawingBuffer: false,
    });

    if(!this.gl) throw new Error('WebGL2 not supported. Use Chrome/Edge/Firefox.');

    const gl = this.gl;

    // Check required extensions
    this.extFloat = gl.getExtension('EXT_color_buffer_float');
    this.extHalf  = gl.getExtension('EXT_color_buffer_half_float');
    if(!this.extFloat && !this.extHalf){
      console.warn('HDR framebuffers not supported — falling back to RGBA8');
    }

    // Check MRT support
    this.hasMRT = true;

    this._buildPrograms();
    this._buildFBOs();

    // Camera
    this.camZ    = 4.2;
    this.rotY    = 0;
    this.rotX    = 0;
    this.autoRot = true;

    window.addEventListener('resize', ()=>this._resize());

    console.log('[Renderer] WebGL2 ready — MRT bloom pipeline active');
  }

  _resize(){
    this.W = this.canvas.width  = window.innerWidth;
    this.H = this.canvas.height = window.innerHeight;
    this.gl.viewport(0,0,this.W,this.H);
    this._buildFBOs();
  }

  // ── SHADER COMPILATION ───────────────────────────────────────
  _mkShader(type, src){
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      const err = gl.getShaderInfoLog(s);
      console.error('[Shader Error]', err);
      throw new Error(err);
    }
    return s;
  }

  _mkProg(vsSrc, fsSrc, tfVaryings){
    const gl = this.gl;
    const p  = gl.createProgram();
    gl.attachShader(p, this._mkShader(gl.VERTEX_SHADER,   vsSrc));
    gl.attachShader(p, this._mkShader(gl.FRAGMENT_SHADER, fsSrc));
    if(tfVaryings) gl.transformFeedbackVaryings(p, tfVaryings, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
      const err = gl.getProgramInfoLog(p);
      console.error('[Program Error]', err);
      throw new Error(err);
    }
    return p;
  }

  _buildPrograms(){
    // Particle program (MRT output: scene + bright)
    this.progParticle = this._mkProg(SHADERS.PARTICLE_VERT, SHADERS.PARTICLE_FRAG);
    // Background
    this.progBg       = this._mkProg(SHADERS.QUAD_VERT, SHADERS.BG_FRAG);
    // Blur
    this.progBlur     = this._mkProg(SHADERS.QUAD_VERT, SHADERS.BLUR_FRAG);
    // Composite
    this.progComp     = this._mkProg(SHADERS.QUAD_VERT, SHADERS.COMPOSITE_FRAG);
  }

  // ── FRAMEBUFFER OBJECTS ──────────────────────────────────────
  _mkTex(w,h,hdr){
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if(hdr && (this.extFloat||this.extHalf)){
      const fmt = this.extFloat ? gl.RGBA16F : gl.RGBA;
      const typ = this.extFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
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
    const gl = this.gl;
    const W=this.W, H=this.H;
    const W2=Math.floor(W/2), H2=Math.floor(H/2);
    const W4=Math.floor(W/4), H4=Math.floor(H/4);

    // Main scene FBO — MRT: [0]=scene, [1]=bright pass
    this.fboScene  = this._mkFBO(W, H, 2, true);
    // Bloom blur FBOs — two sizes for multi-scale bloom
    this.fboBlurH1 = this._mkFBO(W2, H2, 1, true);
    this.fboBlurV1 = this._mkFBO(W2, H2, 1, true);
    this.fboBlurH2 = this._mkFBO(W4, H4, 1, true);
    this.fboBlurV2 = this._mkFBO(W4, H4, 1, true);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0,0,W,H);
  }

  // ── GPU PARTICLE BUFFERS ─────────────────────────────────────
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
    this.bufOrigin = mkVB(physics.origin, 'aOrigin', 3);
    this.bufLife   = mkVB(physics.life,   'aLife',   1);
    this.bufIdx    = mkVB(physics.index,  'aIndex',  1);

    gl.bindVertexArray(null);

    // Quad for post-processing
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

  // ── MATRIX MATH ──────────────────────────────────────────────
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

  // ── UNIFORM HELPERS ──────────────────────────────────────────
  _u(prog, name){ return this.gl.getUniformLocation(prog, name); }

  _bindTex(unit, tex){
    const gl=this.gl;
    gl.activeTexture(gl.TEXTURE0+unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  // ── MAIN RENDER ──────────────────────────────────────────────
  render(time, handState){
    const gl=this.gl;

    // Auto rotation
    if(this.autoRot){
      this.rotY  += 0.0025;
      this.rotX  += 0.0008;
    } else {
      this.rotY *= 0.985;
      this.rotX *= 0.985;
    }
    if(handState?.present) this.autoRot = false;
    else this.autoRot = true;

    // Update GPU buffers
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.physics.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufVel);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.physics.vel);

    // Build MVP
    const proj = this._perspective(55*Math.PI/180, this.W/this.H, 0.01, 50);
    const view = this._mul(
      this._trans(0,0,-this.camZ),
      this._mul(this._rotX(this.rotX), this._rotY(this.rotY))
    );

    const gestId = handState?.gestureId || 0;
    const gestT  = handState?.gestureT  || 0;
    const handPos= handState?.present
      ? [handState.worldX||0, handState.worldY||0, handState.worldZ||0]
      : [99,99,99];

    // ── PASS 1: Background ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScene.fbo);
    gl.viewport(0,0,this.W,this.H);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // Draw starfield bg
    gl.useProgram(this.progBg);
    gl.uniform1f(this._u(this.progBg,'uTime'), time);
    gl.uniform2f(this._u(this.progBg,'uRes'), this.W, this.H);
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── PASS 2: Particles ──
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive blending
    gl.useProgram(this.progParticle);

    gl.uniformMatrix4fv(this._u(this.progParticle,'uProj'), false, proj);
    gl.uniformMatrix4fv(this._u(this.progParticle,'uView'), false, view);
    gl.uniform1f(this._u(this.progParticle,'uTime'),     time);
    gl.uniform2f(this._u(this.progParticle,'uRes'),      this.W, this.H);
    gl.uniform1f(this._u(this.progParticle,'uScale'),    1.6);
    gl.uniform3fv(this._u(this.progParticle,'uHandPos'), handPos);
    gl.uniform1i(this._u(this.progParticle,'uGesture'),  gestId);
    gl.uniform1f(this._u(this.progParticle,'uGestureT'), gestT);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.N);
    gl.bindVertexArray(null);

    // ── PASS 3: Bloom H-blur (half res) ──
    gl.disable(gl.BLEND);
    this._blurPass(this.fboScene.textures[1], this.fboBlurH1, [1,0]);
    this._blurPass(this.fboBlurH1.textures[0], this.fboBlurV1, [0,1]);

    // ── PASS 4: Bloom H-blur (quarter res) ──
    this._blurPass(this.fboBlurV1.textures[0], this.fboBlurH2, [1,0]);
    this._blurPass(this.fboBlurH2.textures[0], this.fboBlurV2, [0,1]);

    // ── PASS 5: Composite to screen ──
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
    gl.uniform1f(this._u(this.progComp,'uTime'),   time);
    gl.uniform2f(this._u(this.progComp,'uRes'),    this.W, this.H);

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
