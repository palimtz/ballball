(function(){"use strict";const r={alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1},i="attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}",l=`precision highp float;
uniform vec2 resolution;
uniform vec4 bounds;
uniform float time;
uniform vec3 pitch;
uniform float round;
uniform vec3 tint;
uniform vec3 strength;
uniform float disperse;
vec2 h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
float edge(vec2 p,float t){
  vec2 i=floor(p),f=fract(p);
  float d1=8.,d2=8.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 g=vec2(float(x),float(y));
    vec2 o=h2(i+g);
    o=.5+.38*sin(t*(.55+.45*o)+6.2831*o);
    float d=length(g+o-f);
    if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}
  }
  return d2-d1;
}
// soft 0: crisp focused filaments (reef, sand); 1: broad dappled light (pitch).
float light(vec2 w,float t,float soft){
  vec2 p=w/132.;
  p+=.32*vec2(sin(p.y*1.3+t*.37),sin(p.x*1.1-t*.29));
  float a=1.-smoothstep(0.,.32+.5*soft,edge(p,t));
  float b=1.-smoothstep(0.,.28+.45*soft,edge(p*1.58+vec2(3.1,7.7),t*1.27+2.));
  float crisp=a*a*a*.8+b*b*b*.45;
  return mix(crisp,(a*a*.7+b*b*.3)*.8,soft);
}
float box(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
void main(){
  vec2 uv=gl_FragCoord.xy/resolution;
  vec2 w=bounds.xy+vec2(uv.x,1.-uv.y)*bounds.zw;
  float t=time;
  float d=round>.5?length(w)-pitch.x:box(w,pitch.xy,pitch.z);
  float soft=(1.-smoothstep(-50.,30.,d))*.45;
  vec3 c;
  if(disperse>.5){
    float base=light(w,t,soft);
    c=vec3(light(w+vec2(3.,1.5),t,soft),base,base);
  }else c=vec3(light(w,t,soft));
  // Swell: broad bright and dim patches drift across so the network never
  // reads as a repeating tile.
  float swell=.5+.5*sin(w.x*.0021+w.y*.0013+t*.16)*sin(w.y*.0027-w.x*.0009-t*.11+1.3);
  swell=.45+.55*swell*swell;
  float mask=d<0.?strength.x:d<60.?mix(strength.y,strength.z,smoothstep(0.,60.,d)):strength.z;
  // Light fades with distance into the blue.
  mask*=1.-smoothstep(900.,2600.,d);
  gl_FragColor=vec4(c*tint*swell*mask,1.);
}`;let o=!1;try{const t=new OffscreenCanvas(1,1).getContext("webgl",r);if(t){const a=(n,f)=>{const s=t.createShader(n);return t.shaderSource(s,f),t.compileShader(s),s},e=t.createProgram();t.attachShader(e,a(t.VERTEX_SHADER,i)),t.attachShader(e,a(t.FRAGMENT_SHADER,l)),t.linkProgram(e),o=!!t.getProgramParameter(e,t.LINK_STATUS),o&&(t.useProgram(e),t.drawArrays(t.TRIANGLES,0,3),t.finish()),t.getExtension("WEBGL_lose_context")?.loseContext()}}catch{o=!1}postMessage(o)})();
