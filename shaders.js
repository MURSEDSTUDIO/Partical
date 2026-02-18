// ═══════════════════════════════════════════════════════════════
//  MURSED.dev — SHADERS.JS — OPTIMIZED
//  Larger particles, pure blue, fast rendering
// ═══════════════════════════════════════════════════════════════

export const SHADERS = {

// ── PARTICLE VERTEX (simplified) ────────────────────────────────
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

  // Pure blue palette (no white)
  vec3 slowColor = vec3(0.0, 0.6, 0.9);
  vec3 fastColor = vec3(0.0, 0.8, 1.0);
  vColor = mix(slowColor, fastColor, min(speed * 2.0, 1.0));

  vAlpha = depth * 0.85;

  // LARGER particle size - clearly visible
  float baseSize = 2.8;  // INCREASED from 1.6
  float speedBoost = 1.0 + speed * 1.5;
  gl_PointSize = clamp(
    baseSize * speedBoost * (uRes.y / 800.0) * depth,
    1.0, 10.0
  );
}`,

// ── PARTICLE FRAGMENT (simple glow) ─────────────────────────────
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

  // Soft disc with glow
  float core  = exp(-r * 3.0);
  float glow  = exp(-r * 1.0) * 0.4;
  float alpha = (core + glow) * vAlpha;

  vec3 col = vColor * (1.0 + core * 0.2);
  fragColor = vec4(col, alpha);

  // Bloom
  float lum = dot(col, vec3(0.2126,0.7152,0.0722));
  brightColor = vec4(col * max(lum - 0.5, 0.0) * 1.5, alpha);
}`,

// ── QUAD VERTEX ──────────────────────────────────────────────────
QUAD_VERT: `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main(){
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`,

// ── BLUR ─────────────────────────────────────────────────────────
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

// ── COMPOSITE ────────────────────────────────────────────────────
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
  
  // Vignette
  vec2 vig = vUV * 2.0 - 1.0;
  col *= 1.0 - dot(vig,vig)*0.15;
  
  fragColor = vec4(col, 1.0);
}`,

// ── BACKGROUND (minimal) ─────────────────────────────────────────
BG_FRAG: `#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 fragColor;
void main(){
  fragColor = vec4(0.0, 0.0, 0.0, 1.0); // pure black
}`,

};
