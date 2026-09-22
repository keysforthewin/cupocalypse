import * as T from "three";

// Instanced procedural surfaces: no repeating sprite atlas, hard disc edges,
// or texture downloads. Each event carries its own seed, age and intensity.
export function effectSurface(
  layer: "mist" | "ring" | "stain" | "flash" | "shadow",
) {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending:
      layer === "flash" || layer === "ring"
        ? T.AdditiveBlending
        : T.NormalBlending,
    uniforms: {
      layer: {
        value: ["mist", "ring", "stain", "flash", "shadow"].indexOf(layer),
      },
    },
    vertexShader: `
      attribute vec4 fxData;
      varying vec2 vUv;
      varying vec4 vFx;
      varying vec3 vTint;
      void main() {
        vUv = uv; vFx = fxData; vTint = instanceColor;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform int layer;
      varying vec2 vUv;
      varying vec4 vFx;
      varying vec3 vTint;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      float fbm(vec2 p) { return .55*noise(p)+.28*noise(p*2.03)+.17*noise(p*4.07); }
      void main() {
        vec2 p=(vUv-.5)*2.; float radius=length(p);
        float age=vFx.x, seed=vFx.y*79., energy=vFx.z, fade=vFx.w;
        float n=fbm(p*3.7+vec2(seed,seed*.37)-vec2(age*.45,age*.9));
        vec3 color=vTint; float alpha=0.;
        if (layer==0) {
          float edge=1.-smoothstep(.35,.97,radius+(n-.5)*.5);
          alpha=edge*smoothstep(.02,.13,age)*exp(-age*2.5)*(.35+n*.4)*fade;
          color=mix(vTint*.42,vTint*1.35,n);
        } else if (layer==1) {
          float ring=1.-smoothstep(.025,.12,abs(radius-(.73+n*.06)));
          alpha=ring*exp(-age*6.)*fade*.65;
        } else if (layer==2) {
          float angle=atan(p.y,p.x);
          float boundary=.52+.16*sin(angle*5.+seed)+.09*sin(angle*11.-seed);
          float pool=1.-smoothstep(boundary-.06,boundary+.07,radius+(n-.5)*.2);
          float flecks=step(.78,noise(p*19.+seed))* (1.-smoothstep(.6,1.,radius));
          alpha=max(pool*.8,flecks*.6)*fade;
          color=mix(vTint*.42,vTint*.8,n)+vec3(.12,.08,.055)*pow(n,10.);
        } else if (layer==4) {
          alpha=exp(-radius*radius*5.)*(1.-smoothstep(.6,1.,radius))*fade*.55;
        } else {
          float rays=pow(max(0.,sin(atan(p.y,p.x)*6.+seed)),12.);
          float glow=exp(-radius*radius*9.)+rays*exp(-radius*8.)*.7;
          alpha=glow*exp(-age*20.)*fade;
          color=mix(vTint,vec3(2.8,1.65,.65),exp(-radius*6.))*min(2.,energy);
        }
        if(alpha<.004) discard;
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}
