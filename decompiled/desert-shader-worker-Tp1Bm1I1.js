(function(){"use strict";const s={alpha:!0,antialias:!1,depth:!1,premultipliedAlpha:!1},n=`#version 300 es
layout(location=0) in vec2 position;
out vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`,l=`#version 300 es
precision highp float;
in vec2 uv;out vec4 color;
uniform sampler2D grain,sandMap;
uniform vec4 view;
uniform vec4 field;
uniform vec3 rocks[5];
uniform float time,progress;
float n(vec2 p){return texture(grain,p/256.).r;}
float f(vec2 p){return n(p)*.65+n(p*2.07+53.)*.35;}
float centre(float x){return field.y+168.+sin(x*.0039+1.1)*38.+sin(x*.0105)*9.;}
float slope(float x){return cos(x*.0039+1.1)*.1482+cos(x*.0105)*.0945;}
float boundary(vec2 p){vec2 q=abs(p)-field.xy+field.z;return length(max(q,0.))+min(max(q.x,q.y),0.)-field.z;}
void main(){
 vec2 p=view.xy+vec2(uv.x,1.-uv.y)*view.zw;
 float travel=clamp((p.x+field.x+180.)/(field.x*2.+360.),0.,1.);
 float surge=smoothstep(.2,.78,progress-travel*.17);
 float s=slope(p.x),across=(p.y-centre(p.x))/sqrt(1.+s*s);
 float irregular=(f(p*.052)-.5)*4.5+(n(p*.47)-.5)*1.1;
 float width=16.+sin(p.x*.017+1.)*3.+sin(p.x*.031)*2.+surge*7.;
 // A gravel bar divides the channel. Its bypass joins the main stream at
 // both ends; the leading water travels downstream along the same bend.
 float reach=smoothstep(-field.x-50.,-field.x+170.,p.x)*(1.-smoothstep(field.x*.4,field.x+80.,p.x));
 float bypass=across+sin(reach*1.570796)*35.;
 float branchFront=smoothstep(.30,.64,progress-travel*.36);
 float dMain=abs(across)-width;
 float dBranch=abs(bypass)-(3.+branchFront*6.)*reach;
 float d=mix(dMain,min(dMain,dBranch),branchFront*reach);
 float stone=1000.;
 for(int i=0;i<5;i++){
   vec2 q=(p-rocks[i].xy)/vec2(1.,.74);
   stone=min(stone,length(q)-rocks[i].z*.90);
 }
 float bank=d+irregular;
 float edge=boundary(p);
 // Capillary damp is deliberately broader than the water. It may reach the
 // playable sand; standing water is excluded even from the player apron.
 float dampWidth=28.+surge*98.+f(p*.028)*12.;
 float damp=pow(1.-smoothstep(-2.,dampWidth,bank),.58)*smoothstep(-48.,-8.,edge);
 float water=(1.-smoothstep(-1.15,1.25,bank))*smoothstep(field.w,field.w+8.,edge)*smoothstep(-.6,1.6,stone);
 float alpha=max(damp*.74,water*.97);
 if(alpha<.003)discard;
 vec3 ground=texture(sandMap,p/1024.).rgb;
 vec3 wetGround=ground*vec3(.66,.70,.67);
 vec3 result=wetGround;
 if(water>.001){
   float depth=clamp(-bank/(width*1.8),0.,1.);
   vec2 tangent=normalize(vec2(1.,s));
   // Flow follows the bend; two offset phases prevent a visible texture reset.
   float ph=fract(time*.055),ph2=fract(time*.055+.5),blend=abs(ph*2.-1.);
   vec2 a=p-tangent*ph*320.,b=p-tangent*ph2*320.;
   float grainFlow=mix(f(a*.10),f(b*.10),blend);
   float micro=mix(n(a*.61),n(b*.61),blend);
   // The sand/gravel bed remains visible. No opaque deep-water blue.
   vec3 bed=ground*vec3(.79,.87,.83);
   float fleck=n(p*.73);
   bed+=vec3(.11,.115,.09)*smoothstep(.71,.87,fleck);
   bed-=vec3(.085,.078,.067)*(1.-smoothstep(.14,.27,fleck));
   vec3 clearWater=mix(bed,vec3(.61,.80,.79),.29+depth*.23);
   float ripple=sin(across*.61+sin(p.x*.025-time*1.5)*1.7+grainFlow*3.);
   float crest=pow(max(0.,ripple),14.)*smoothstep(.43,.69,grainFlow);
   clearWater+=vec3(.40,.45,.39)*crest*.38;
   clearWater+=vec3(.1,.13,.12)*(grainFlow-.45);
   float sparkle=pow(max(0.,(micro-.65)*3.),5.)*crest;
   clearWater+=vec3(.8,.85,.72)*sparkle*.16;
   // Short ripples collect against stones, breaking into downstream wakes.
   float wake=exp(-max(stone,0.)*.13)*pow(max(0.,sin(stone*.9-time*3.2+grainFlow*2.)),8.);
   clearWater=mix(clearWater,vec3(.88,.92,.78),wake*.25);
   result=mix(wetGround,clearWater,water);
 }
 color=vec4(result,alpha);
}`;let t=!1;try{const e=new OffscreenCanvas(1,1).getContext("webgl2",s);if(e){const r=(i,c)=>{const o=e.createShader(i);return e.shaderSource(o,c),e.compileShader(o),o},a=e.createProgram();e.attachShader(a,r(e.VERTEX_SHADER,n)),e.attachShader(a,r(e.FRAGMENT_SHADER,l)),e.linkProgram(a),t=!!e.getProgramParameter(a,e.LINK_STATUS),t&&(e.useProgram(a),e.drawArrays(e.TRIANGLES,0,3),e.finish()),e.getExtension("WEBGL_lose_context")?.loseContext()}}catch{t=!1}postMessage(t)})();
