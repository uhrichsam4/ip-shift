import * as THREE from 'three';
import { COLORS, LAYOUT } from './shared';

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
} as const;

/** Flowing energy along a tube (uv.x = 0..1 along length). uState: 1 up, 0 down, 0.5 negotiating. */
export function streamMaterial(width = 1) {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: {
      uTime: { value: 0 },
      uUp: { value: 1 },
      uNeg: { value: 0 },
      uGain: { value: 1 },
      uWidth: { value: width },
      uAmber: { value: 0 },
      cA: { value: COLORS.blue },
      cB: { value: COLORS.cyan },
      cC: { value: COLORS.violet },
      cAmber: { value: COLORS.amber },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vFres;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vec3 n = normalize(normalMatrix * normal);
        vFres = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uUp, uNeg, uGain, uWidth, uAmber;
      uniform vec3 cA, cB, cC, cAmber;
      varying vec2 vUv; varying float vFres;
      float hash(float n){ return fract(sin(n)*43758.5453); }
      void main(){
        float u = vUv.x;
        vec3 col = u < 0.5 ? mix(cA, cB, u*2.0) : mix(cB, cC, (u-0.5)*2.0);
        col = mix(col, cAmber, uAmber);
        float t = uTime;
        // travelling heads with fading tails
        float h1 = fract(u*1.0 - t*0.45);
        float h2 = fract(u*1.0 - t*0.45 + 0.5);
        float heads = pow(h1, 10.0)*2.6 + pow(h2, 14.0)*1.6;
        float body = 0.35 + 0.15*sin(u*40.0 - t*6.0);
        float up = (body + heads);
        // broken dim dash
        float dash = step(0.55, fract(u*14.0 + t*0.15)) * 0.16 * step(0.2, hash(floor(u*14.0)));
        // negotiating: flickering reconnect pulses
        float flick = step(0.45, hash(floor(t*14.0))) * (0.4 + pow(fract(u*2.0 - t*1.6), 6.0)*2.0);
        float v = mix(dash, up, uUp);
        v = mix(v, flick, uNeg);
        float core = pow(vFres, 1.5*uWidth);
        float endFade = smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.96, 1.0, u));
        gl_FragColor = vec4(col * v * core * uGain * endFade * 1.6, 1.0);
      }`,
  });
}

/** Fresnel additive shell (globe grid, light cones, nodes). */
export function fresnelMaterial(color: THREE.Color, opts: { power?: number; gain?: number; vfade?: boolean } = {}) {
  return new THREE.ShaderMaterial({
    ...additive,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: color.clone() },
      uGain: { value: opts.gain ?? 1 },
      uPow: { value: opts.power ?? 2.5 },
      uVFade: { value: opts.vfade ? 1 : 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying float vF; varying vec2 vUv; varying vec3 vP;
      void main(){
        vUv = uv; vP = position;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vec3 n = normalize(normalMatrix * normal);
        vF = 1.0 - abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uGain, uPow, uVFade, uTime;
      varying float vF; varying vec2 vUv; varying vec3 vP;
      void main(){
        float f = pow(vF, uPow);
        float fade = mix(1.0, pow(1.0 - vUv.y, 1.6) * smoothstep(0.0, 0.06, vUv.y), uVFade);
        float grid = 1.0;
        gl_FragColor = vec4(uColor * f * fade * uGain * grid, 1.0);
      }`,
  });
}

/** Soft volumetric light cone: brightest at the base, facing-ratio weighted so the silhouette dissolves (no hard trapezoid edge). */
export function coneMaterial(color: THREE.Color, peak = 0.18) {
  return new THREE.ShaderMaterial({
    ...additive,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uGain: { value: 1 }, uPeak: { value: peak } },
    vertexShader: /* glsl */ `
      varying float vN; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vec3 n = normalize(normalMatrix * normal);
        vN = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uGain, uPeak; varying float vN; varying vec2 vUv;
      void main(){
        // CylinderGeometry: v = 0 at the (wide) base, 1 at the top
        float h = pow(1.0 - vUv.y, 2.0) * smoothstep(0.0, 0.08, vUv.y);
        float edge = pow(vN, 1.6); // 0 at the silhouette → soft edges
        float a = uPeak * h * edge * uGain;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
}

/** Glass network node: dim glassy core + fresnel rim (instanced colours supported). Dimmed only by uGain (alpha/emissive), never toward grey. */
export function glassNodeMaterial(core: THREE.Color, rim: THREE.Color) {
  return new THREE.ShaderMaterial({
    ...additive,
    fog: false,
    uniforms: { uCore: { value: core.clone() }, uRim: { value: rim.clone() }, uGain: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform vec3 uCore; varying float vF; varying vec3 vCore; varying float vDepth;
      void main(){
        vec4 p = vec4(position, 1.0);
        vec3 nn = normal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          nn = mat3(instanceMatrix) * nn;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vCore = instanceColor;
        #else
          vCore = uCore;
        #endif
        vec4 mv = modelViewMatrix * p;
        vec3 n = normalize(normalMatrix * nn);
        vF = 1.0 - abs(dot(n, normalize(-mv.xyz)));
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uRim; uniform float uGain; varying float vF; varying vec3 vCore; varying float vDepth;
      void main(){
        float rim = pow(vF, 2.4);
        float body = 0.16 + 0.3 * pow(1.0 - vF, 3.0);
        vec3 rimCol = mix(uRim, vCore, 0.35);
        vec3 col = vCore * 1.3 * body + rimCol * 2.0 * rim;
        float a = uGain * (1.0 - 0.55 * smoothstep(5.0, 14.0, vDepth));
        gl_FragColor = vec4(col * a, 1.0);
      }`,
  });
}

/** Globe grid lines: fresnel-weighted + slow scan. */
export function globeGridMaterial() {
  const m = fresnelMaterial(COLORS.blue, { power: 2.4, gain: 0.35 });
  return m;
}

/** Globe dots: twinkle by position hash, fresnel rim. Works on meshes or points. */
export function globeDotsMaterial(points = false) {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: { uTime: { value: 0 }, uGain: { value: 1 }, uColor: { value: COLORS.cyan }, uSize: { value: 2.2 } },
    vertexShader: /* glsl */ `
      uniform float uTime, uSize; varying float vTw; varying float vF;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        float h = hash(floor(position*40.0));
        vTw = 0.35 + 0.65*pow(0.5+0.5*sin(uTime*(0.6+h*1.8) + h*40.0), 3.0);
        vec3 n = normalize(normalMatrix * normalize(position));
        vF = 0.25 + 0.75*pow(1.0-abs(dot(n, normalize(-mv.xyz))), 1.4);
        ${points ? 'gl_PointSize = uSize * (3.0 / -mv.z);' : ''}
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uGain; varying float vTw; varying float vF;
      void main(){
        ${points ? 'vec2 c = gl_PointCoord-0.5; float d = (1.0 - smoothstep(0.1, 0.5, length(c)));' : 'float d = 1.0;'}
        gl_FragColor = vec4(uColor * vTw * vF * d * uGain, 1.0);
      }`,
  });
}

/** Ribbon: vertex wave + flowing blue→cyan→violet gradient (uv.x along length, uv.y across). */
export function ribbonMaterial(procedural: boolean) {
  return new THREE.ShaderMaterial({
    ...additive,
    side: THREE.FrontSide,
    uniforms: { uTime: { value: 0 }, uGain: { value: 1 }, uSeed: { value: 0 }, cA: { value: COLORS.blue }, cB: { value: COLORS.cyan }, cC: { value: COLORS.violetDeep } },
    vertexShader: /* glsl */ `
      uniform float uTime, uSeed; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        float s = uSeed;
        ${procedural ? 'p.y += sin(uv.x*3.2 + s*2.0)*0.9 + sin(uv.x*7.0 - s)*0.25; p.z += cos(uv.x*2.5 + s)*0.8;' : ''}
        p.y += sin(uv.x*6.2831*1.3 + uTime*0.35 + s*3.0)*0.14 + sin(uv.x*9.0 - uTime*0.22 + s)*0.06;
        p.z += cos(uv.x*6.2831*0.8 + uTime*0.25 + s)*0.18;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uGain, uSeed; uniform vec3 cA, cB, cC; varying vec2 vUv;
      void main(){
        float u = fract(vUv.x*0.6 - uTime*0.03 + uSeed*0.37);
        vec3 col = u < 0.5 ? mix(cA, cB, u*2.0) : mix(cB, cC, (u-0.5)*2.0);
        float across = pow(1.0 - abs(vUv.y*2.0-1.0), 2.2);
        float edge = smoothstep(0.0,0.12,vUv.x)*(1.0 - smoothstep(0.88, 1.0, vUv.x));
        float streak = 0.55 + 0.45*sin(vUv.x*60.0 - uTime*1.4 + vUv.y*6.0);
        float glow = across * edge * (0.35 + 0.25*streak);
        gl_FragColor = vec4(col * glow * uGain, 1.0);
      }`,
  });
}

/** Drifting atmospheric particles (instanced points). */
export function particleMaterial() {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: { uTime: { value: 0 }, uGain: { value: 1 }, uSize: { value: 1 }, uColor: { value: COLORS.blue }, uColor2: { value: COLORS.cyanHot } },
    vertexShader: /* glsl */ `
      uniform float uTime, uSize; attribute float aSeed; varying float vA; varying float vS;
      void main(){
        vec3 p = position;
        p.y += mod(uTime*0.04*(0.4+aSeed) + aSeed*10.0, 4.5) - 0.5 - position.y*0.0;
        p.x += sin(uTime*0.15 + aSeed*30.0)*0.12;
        p.z += cos(uTime*0.11 + aSeed*20.0)*0.12;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_PointSize = uSize * (0.6 + aSeed*1.6) * (6.0 / -mv.z);
        vA = (0.25 + 0.75*fract(aSeed*7.13)) * smoothstep(-14.0, -1.0, mv.z*1.0) ;
        vS = aSeed;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGain; uniform vec3 uColor, uColor2; varying float vA; varying float vS;
      void main(){
        float d = (1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord-0.5)));
        gl_FragColor = vec4(mix(uColor, uColor2, step(0.85, vS)) * d * vA * uGain * 0.55, 1.0);
      }`,
  });
}

/** Unlit floor: baked radial gradient + faint grid in ONE opaque shader (no lights, no env). */
export function floorMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uGain: { value: 1 },
      uGlow: { value: 1 },
      uGrid: { value: COLORS.blue },
      uRing: { value: COLORS.cyan },
      uBase: { value: new THREE.Color('#070B16') },
      uEdge: { value: new THREE.Color('#03050A') },
      uP0: { value: new THREE.Vector2(LAYOUT.laptop.x, LAYOUT.laptop.z) },
      uP1: { value: new THREE.Vector2(LAYOUT.router.x, LAYOUT.router.z) },
    },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      uniform float uGain, uGlow; uniform vec3 uGrid, uRing, uBase, uEdge; uniform vec2 uP0, uP1; varying vec3 vW;
      void main(){
        float r2 = dot(vW.xz, vW.xz);
        vec3 col = mix(uEdge, uBase, exp(-r2*0.25));
        // faked polished-stone reflection: fresnel × blurred vertical gradient of the studio HDRI
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.04 + 0.96*pow(1.0 - V.y, 5.0);
        vec3 env = mix(vec3(0.010,0.016,0.035), vec3(0.05,0.11,0.22), smoothstep(-6.0, 6.0, vW.x*0.7 - vW.z)) * (0.6 + 0.4*sin(vW.x*0.9));
        // the fake reflection only near the stage: at grazing angles far away it read as a lighter horizon band
        float rr = sqrt(r2);
        col += env * fres * 0.9 * (1.0 - smoothstep(1.2, 4.5, rr));
        // grid
        vec2 g = abs(fract(vW.xz*4.0 - 0.5) - 0.5) / fwidth(vW.xz*4.0);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float fade = exp(-r2*0.35) * (1.0 - smoothstep(0.2, 1.3, vW.z));
        col += uGrid * line * fade * 0.05;
        // baked contact AO + soft emissive ring bounce under each pedestal (no extra draws)
        float d0 = length(vW.xz - uP0), d1 = length(vW.xz - uP1);
        float ao = smoothstep(0.26, 0.55, d0) * smoothstep(0.26, 0.55, d1);
        col *= mix(0.25, 1.0, ao);
        float b0 = exp(-pow((d0 - 0.31)*9.0, 2.0)) + 0.35*exp(-pow((d0-0.31)*3.5,2.0));
        float b1 = exp(-pow((d1 - 0.31)*9.0, 2.0)) + 0.35*exp(-pow((d1-0.31)*3.5,2.0));
        col += uRing * (b0 + b1) * 0.06 * uGlow;
        // dissolve into the void well before the horizon: no visible floor edge
        col = mix(col, uEdge, smoothstep(2.2, 7.0, rr));
        gl_FragColor = vec4(col * uGain, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Earth dots: subtle twinkle, dimmer toward the limb, faint on the far side. */
export function earthDotsMaterial() {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: { uTime: { value: 0 }, uGain: { value: 1 }, uColor: { value: new THREE.Color('#7FD8FF') }, uHot: { value: COLORS.cyanHot } },
    vertexShader: /* glsl */ `
      uniform float uTime; varying float vB;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vec3 n = normalize(normalMatrix * normalize(position));
        float ndv = dot(n, normalize(-mv.xyz));
        float h = hash(floor(position*80.0));
        float tw = 0.75 + 0.25*sin(uTime*(0.5+h*1.5) + h*50.0);
        float limb = smoothstep(-0.05, 0.6, ndv);
        vB = tw * mix(0.08, 1.0, limb) * (ndv < 0.0 ? 0.35 : 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor, uHot; uniform float uGain; varying float vB;
      void main(){ gl_FragColor = vec4(mix(uColor, uHot, vB*vB*0.5) * vB * uGain, 1.0); }`,
  });
}

/** Atmosphere: soft fresnel rim, blue → cyan. */
export function atmosphereMaterial() {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: { uGain: { value: 1 }, uTime: { value: 0 }, cA: { value: COLORS.blue }, cB: { value: COLORS.cyan } },
    vertexShader: /* glsl */ `
      varying float vF;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vec3 n = normalize(normalMatrix * normal);
        vF = 1.0 - abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGain; uniform vec3 cA, cB; varying float vF;
      void main(){ float f = pow(vF, 3.5); gl_FragColor = vec4(mix(cA, cB, f) * f * 0.9 * uGain, 1.0); }`,
  });
}

/** Faint floor grid, fades with distance from origin. */
export function floorGridMaterial() {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: { uGain: { value: 1 }, uColor: { value: COLORS.blue } },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      uniform float uGain; uniform vec3 uColor; varying vec3 vW;
      void main(){
        vec2 g = abs(fract(vW.xz*4.0 - 0.5) - 0.5) / fwidth(vW.xz*4.0);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float fade = exp(-dot(vW.xz, vW.xz)*0.35) * (1.0 - smoothstep(0.2, 1.3, vW.z));
        gl_FragColor = vec4(uColor * line * fade * 0.12 * uGain, 1.0);
      }`,
  });
}
