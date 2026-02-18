// ═══════════════════════════════════════════════════════════════
//  MURSED.dev — SHADERS.JS
//  Professional GLSL — Particle + Post-Processing Pipeline
// ═══════════════════════════════════════════════════════════════

export const SHADERS = {

// ── PARTICLE VERTEX SHADER ─────────────────────────────────────
PARTICLE_VERT: `#version 300 es
precision highp float;
precision highp int;

in vec3  aPos;
in vec3  aVel;
in vec3  aOrigin;
in float aLife;
in float aIndex;

uniform mat4  uProj;
uniform mat4  uView;
uniform float uTime;
uniform vec2  uRes;
uniform float uScale;
uniform vec3  uHandPos;
uniform int   uGesture;
uniform float uGestureT;

out vec3  vColor;
out float vAlpha;
out float vSize;
out float vGlow;
out float vTemp;

// ── Simplex noise for organic turbulence ──
vec3 mod289(vec3 x){ return x - floor(x*(1./289.))*289.; }
vec4 mod289(vec4 x){ return x - floor(x*(1./289.))*289.; }
vec4 permute(vec4 x){ return mod289(((x*34.)+1.)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }

float snoise(vec3 v){
  const vec2 C = vec2(1./6., 1./3.);
  const vec4 D = vec4(0.,0.5,1.,2.);
  vec3 i  = floor(v + dot(v,C.yyy));
  vec3 x0 = v - i + dot(i,C.xxx);
  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz,l.zxy);
  vec3 i2 = max(g.xyz,l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z+vec4(0.,i1.z,i2.z,1.))
   +i.y+vec4(0.,i1.y,i2.y,1.))
   +i.x+vec4(0.,i1.x,i2.x,1.));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.*floor(p*ns.z*ns.z);
  vec4 x_ = floor(j*ns.z);
  vec4 y_ = floor(j - 7.*x_);
  vec4 x = x_*ns.x + ns.yyyy;
  vec4 y = y_*ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy,y.xy);
  vec4 b1 = vec4(x.zw,y.zw);
  vec4 s0 = floor(b0)*2.+1.;
  vec4 s1 = floor(b1)*2.+1.;
  vec4 sh = -step(h, vec4(0.));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m = m*m;
  return 42.*dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

// ── Color palette: deep blue tones only ──
vec3 palette(float t, float speed, float dist){
  // Deep cyan → electric blue gradient (no white)
  vec3 a = vec3(0.00, 0.50, 0.75);
  vec3 b = vec3(0.15, 0.35, 0.40);
  vec3 c = vec3(0.80, 0.90, 0.85);
  vec3 d = vec3(0.00, 0.20, 0.60);
  vec3 base = a + b*cos(6.28318*(c*t + d));

  // Speed tint: deep cyan to bright electric blue (no white)
  vec3 fast = vec3(0.0, 0.7, 1.0);
  return mix(base, fast, clamp(speed * 1.2, 0., 0.6));
}

void main(){
  vec4 viewPos = uView * vec4(aPos, 1.0);
  gl_Position  = uProj * viewPos;

  float speed  = length(aVel);
  float distH  = length(aPos - uHandPos);
  float depth  = clamp((-viewPos.z) / 8.0, 0.1, 1.0);

  // Organic per-particle hue variation via noise
  float noiseT = snoise(aOrigin * 0.8 + uTime * 0.0005) * 0.5 + 0.5;
  float colorT = aLife * 0.6 + noiseT * 0.4 + speed * 0.3;

  vColor = palette(colorT, speed, distH);

  // Temperature — proximity to hand
  vTemp  = clamp(1.0 - distH / 3.5, 0.0, 1.0);

  // Heat color: near hand = bright cyan-blue (no white)
  vColor = mix(vColor, vec3(0.0, 0.8, 1.0), vTemp * vTemp * 0.5);

  // Gesture-specific color shifts
  if(uGesture == 2){ // FIST compress
    vColor = mix(vColor, vec3(0.1, 0.4, 1.0), uGestureT * 0.6);
  } else if(uGesture == 3){ // SWIPE scatter
    vColor = mix(vColor, vec3(0.0, 1.0, 0.7), min(speed * 1.5, 1.0));
  } else if(uGesture == 4){ // PEACE wave
    float waveTint = sin(aPos.x * 3.0 + uTime * 0.003) * 0.5 + 0.5;
    vColor = mix(vColor, vec3(0.6, 0.3, 1.0), waveTint * uGestureT * 0.5);
  }

  vGlow  = 0.4 + vTemp * 0.6 + speed * 0.4;
  vAlpha = clamp(depth * (0.7 + speed * 0.5) * vGlow, 0.0, 1.0);

  // Point size: perspective + speed trails + gesture influence
  float baseSize = uScale * (uRes.y / 900.0);
  float speedSize = 1.0 + speed * 2.5;
  float gestureSize = (uGesture == 2) ? (1.0 + uGestureT * 1.5) : 1.0;

  gl_PointSize = clamp(
    baseSize * speedSize * gestureSize * depth,
    0.3, 8.0
  );
}`,

// ── PARTICLE FRAGMENT SHADER ────────────────────────────────────
PARTICLE_FRAG: `#version 300 es
precision mediump float;

in vec3  vColor;
in float vAlpha;
in float vGlow;
in float vTemp;

layout(location=0) out vec4 fragColor;
layout(location=1) out vec4 brightColor; // for bloom pass

void main(){
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r  = dot(uv,uv);
  if(r > 1.0) discard;

  // Multi-layer glow disc
  float core    = exp(-r * 4.5);           // tight bright core
  float inner   = exp(-r * 2.0) * 0.5;    // inner glow
  float outer   = exp(-r * 0.8) * 0.18;   // soft outer halo
  float rim     = smoothstep(0.8,1.0,1.0-r) * 0.08; // edge sparkle

  float totalGlow = core + inner + outer + rim;
  float alpha     = totalGlow * vAlpha;

  // Blue core (no white-hot effect)
  vec3 coreColor = vColor * (1.0 + core * 0.3);
  vec3 finalColor = coreColor * totalGlow;

  fragColor   = vec4(finalColor, alpha);

  // Bright pass for bloom (only very bright pixels)
  float lum = dot(finalColor, vec3(0.2126,0.7152,0.0722));
  brightColor = vec4(finalColor * max(lum - 0.4, 0.0) * 2.0, alpha);
}`,

// ── FULL-SCREEN QUAD VERTEX ─────────────────────────────────────
QUAD_VERT: `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main(){
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`,

// ── GAUSSIAN BLUR ───────────────────────────────────────────────
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
  // 15-tap high-quality gaussian
  float weights[8];
  weights[0]=0.00598; weights[1]=0.02602; weights[2]=0.07820;
  weights[3]=0.16271; weights[4]=0.22338; weights[5]=0.16271;
  weights[6]=0.07820; weights[7]=0.02602;
  for(int i=0;i<8;i++){
    vec2 offset = step * float(i-4);
    col += texture(uTex, vUV + offset) * weights[i];
  }
  // Extra wide bloom tap
  col += texture(uTex, vUV + step*8.0) * 0.003;
  col += texture(uTex, vUV - step*8.0) * 0.003;
  fragColor = col;
}`,

// ── COMPOSITE / TONE MAP ────────────────────────────────────────
COMPOSITE_FRAG: `#version 300 es
precision mediump float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBloom2;
uniform float uTime;
uniform vec2  uRes;
in vec2 vUV;
out vec4 fragColor;

// ACES filmic tone mapping
vec3 aces(vec3 x){
  float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.);
}

// Chromatic aberration
vec3 chromaAberration(sampler2D tex, vec2 uv, float strength){
  vec2 dir = (uv - 0.5) * strength;
  float r = texture(tex, uv + dir*1.0).r;
  float g = texture(tex, uv + dir*0.0).g;
  float b = texture(tex, uv - dir*1.0).b;
  return vec3(r,g,b);
}

void main(){
  // Base scene with slight chromatic aberration
  vec3 scene = chromaAberration(uScene, vUV, 0.004);

  // Multi-scale bloom
  vec3 bloom1 = texture(uBloom,  vUV).rgb;
  vec3 bloom2 = texture(uBloom2, vUV).rgb;
  vec3 bloom  = bloom1 * 0.7 + bloom2 * 0.4;

  // Combine
  vec3 col = scene + bloom * 1.2;

  // ACES tone mapping
  col = aces(col * 1.1);

  // Gamma correction
  col = pow(col, vec3(1.0/2.2));

  // Subtle vignette
  vec2 vig = vUV * 2.0 - 1.0;
  float vignette = 1.0 - dot(vig,vig)*0.18;
  col *= vignette;

  // Subtle scanline texture (cinematic feel)
  float scan = sin(vUV.y * uRes.y * 3.14159) * 0.012 + 0.988;
  col *= scan;

  // Subtle film grain
  float grain = fract(sin(dot(vUV + fract(uTime*0.001), vec2(127.1,311.7)))*43758.5453);
  col += (grain - 0.5) * 0.018;

  fragColor = vec4(clamp(col,0.,1.), 1.0);
}`,

// ── BACKGROUND STARFIELD ────────────────────────────────────────
BG_FRAG: `#version 300 es
precision mediump float;
uniform float uTime;
uniform vec2  uRes;
in vec2 vUV;
out vec4 fragColor;

float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }

void main(){
  vec2 uv = vUV;
  vec3 col = vec3(0.0);

  // Deep space background gradient
  float dist = length(uv - 0.5);
  col += vec3(0.0, 0.02, 0.06) * (1.0 - dist * 1.5);

  // Stars
  for(int i=0;i<3;i++){
    float scale = 400.0 + float(i)*300.0;
    vec2 grid = floor(uv * scale);
    vec2 local = fract(uv * scale) - 0.5;
    float h = hash(grid + float(i)*17.3);
    if(h > 0.985){
      float twinkle = sin(uTime * 0.001 * (h*5.0+1.0) + h*6.28) * 0.4 + 0.6;
      float star = exp(-dot(local,local) * 500.0) * twinkle;
      col += vec3(0.5,0.8,1.0) * star * (h * 0.5 + 0.3);
    }
  }

  // Nebula wisps
  float n1 = sin(uv.x*3.+uTime*0.0003)*sin(uv.y*2.+uTime*0.0002)*0.5+0.5;
  col += vec3(0.0, 0.02, 0.08) * n1 * 0.3;

  fragColor = vec4(col, 1.0);
}`,

};
