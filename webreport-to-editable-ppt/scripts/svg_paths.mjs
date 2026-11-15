// Convert SVG basic geometry and M/L/H/V/C/S/Q/T/A/Z paths to native PPT paths.
export function geometryCommands(tag,a){
 const n=(k,d=0)=>Number(a[k]??d),M=(x,y)=>({moveTo:{x,y}}),L=(x,y)=>({lineTo:{x,y}}),C=(x1,y1,x2,y2,x,y)=>({cubicBezTo:{x1,y1,x2,y2,x,y}}),Z=()=>({close:{}});
 if(tag==='line')return [M(n('x1'),n('y1')),L(n('x2'),n('y2'))];
 if(['polyline','polygon'].includes(tag)){const v=(a.points||'').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.map(Number)||[];return v.reduce((p,vv,i)=>i%2?p:[...p,i?L(vv,v[i+1]):M(vv,v[i+1])],[]).concat(tag==='polygon'?[Z()]:[]);}
 if(tag==='rect'){let x=n('x'),y=n('y'),w=n('width'),h=n('height'),r=Math.min(n('rx',n('ry')),w/2,h/2);if(!r)return[M(x,y),L(x+w,y),L(x+w,y+h),L(x,y+h),Z()];const k=.55228475;return[M(x+r,y),L(x+w-r,y),C(x+w-r+k*r,y,x+w,y+r-k*r,x+w,y+r),L(x+w,y+h-r),C(x+w,y+h-r+k*r,x+w-r+k*r,y+h,x+w-r,y+h),L(x+r,y+h),C(x+r-k*r,y+h,x,y+h-r+k*r,x,y+h-r),L(x,y+r),C(x,y+r-k*r,x+r-k*r,y,x+r,y),Z()];}
 if(['circle','ellipse'].includes(tag)){let x=n('cx'),y=n('cy'),rx=n('rx',n('r')),ry=n('ry',n('r')),k=.55228475;return[M(x+rx,y),C(x+rx,y+k*ry,x+k*rx,y+ry,x,y+ry),C(x-k*rx,y+ry,x-rx,y+k*ry,x-rx,y),C(x-rx,y-k*ry,x-k*rx,y-ry,x,y-ry),C(x+k*rx,y-ry,x+rx,y-k*ry,x+rx,y),Z()];}
 if(tag!=='path')throw Error('Unsupported SVG '+tag);
 const tokens=(a.d||'').match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g)||[];let i=0,cmd='',x=0,y=0,sx=0,sy=0,cx=0,cy=0,qx=0,qy=0,prev='',out=[];
 const read=()=>{if(i>=tokens.length||/^[a-z]$/i.test(tokens[i]))throw Error('Invalid SVG path');return Number(tokens[i++]);};
 while(i<tokens.length){if(/^[a-z]$/i.test(tokens[i]))cmd=tokens[i++];const lower=cmd.toLowerCase(),rel=cmd===lower;
  if(lower==='z'){out.push(Z());x=sx;y=sy;prev='z';cmd='';continue;}
  let ox=x,oy=y;const X=v=>v+(rel?ox:0),Y=v=>v+(rel?oy:0);
  if(lower==='m'||lower==='l'){x=X(read());y=Y(read());out.push(lower==='m'?M(x,y):L(x,y));if(lower==='m'){sx=x;sy=y;cmd=rel?'l':'L';}}
  else if(lower==='h'){x=X(read());out.push(L(x,y));}
  else if(lower==='v'){y=Y(read());out.push(L(x,y));}
  else if(lower==='c'){let x1=X(read()),y1=Y(read()),x2=X(read()),y2=Y(read());x=X(read());y=Y(read());out.push(C(x1,y1,x2,y2,x,y));cx=x2;cy=y2;}
  else if(lower==='s'){let x1=['c','s'].includes(prev)?2*x-cx:x,y1=['c','s'].includes(prev)?2*y-cy:y,x2=X(read()),y2=Y(read());x=X(read());y=Y(read());out.push(C(x1,y1,x2,y2,x,y));cx=x2;cy=y2;}
  else if(lower==='q'||lower==='t'){let x1=lower==='q'?X(read()):['q','t'].includes(prev)?2*x-qx:x,y1=lower==='q'?Y(read()):['q','t'].includes(prev)?2*y-qy:y;x=X(read());y=Y(read());out.push({quadBezTo:{x1,y1,x,y}});qx=x1;qy=y1;}
  else if(lower==='a'){let rx=Math.abs(read()),ry=Math.abs(read()),phi=read()*Math.PI/180,large=read(),sweep=read();x=X(read());y=Y(read());if(!rx||!ry){out.push(L(x,y));}else if(x!==ox||y!==oy){
   const co=Math.cos(phi),si=Math.sin(phi),xp=co*(ox-x)/2+si*(oy-y)/2,yp=-si*(ox-x)/2+co*(oy-y)/2;
   const lam=xp*xp/(rx*rx)+yp*yp/(ry*ry);if(lam>1){rx*=Math.sqrt(lam);ry*=Math.sqrt(lam);}
   let fact=Math.sqrt(Math.max(0,(rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp)/(rx*rx*yp*yp+ry*ry*xp*xp)))*(large===sweep?-1:1);
   let cpx=fact*rx*yp/ry,cpy=-fact*ry*xp/rx,ccx=co*cpx-si*cpy+(ox+x)/2,ccy=si*cpx+co*cpy+(oy+y)/2;
   let u=(xp-cpx)/rx,v=(yp-cpy)/ry,uu=(-xp-cpx)/rx,vv=(-yp-cpy)/ry,t=Math.atan2(v,u),delta=Math.atan2(u*vv-v*uu,u*uu+v*vv);if(!sweep&&delta>0)delta-=2*Math.PI;if(sweep&&delta<0)delta+=2*Math.PI;
   let parts=Math.ceil(Math.abs(delta)/(Math.PI/2)),dt=delta/parts;
   const pos=t=>[ccx+co*rx*Math.cos(t)-si*ry*Math.sin(t),ccy+si*rx*Math.cos(t)+co*ry*Math.sin(t)];
   const der=t=>[-co*rx*Math.sin(t)-si*ry*Math.cos(t),-si*rx*Math.sin(t)+co*ry*Math.cos(t)];
   for(let j=0;j<parts;j++){let t2=t+dt,k=4/3*Math.tan(dt/4),p1=pos(t),p2=pos(t2),d1=der(t),d2=der(t2);out.push(C(p1[0]+k*d1[0],p1[1]+k*d1[1],p2[0]-k*d2[0],p2[1]-k*d2[1],p2[0],p2[1]));t=t2;}
  }} else throw Error('Unsupported SVG command '+cmd);
  prev=lower;
 }
 return out;
}
export function transformCommands(commands,m){const [a,b,c,d,e,f]=m;const pt=(x,y)=>({x:a*x+c*y+e,y:b*x+d*y+f});return commands.map(v=>{if(v.close)return v;if(v.moveTo)return{moveTo:pt(v.moveTo.x,v.moveTo.y)};if(v.lineTo)return{lineTo:pt(v.lineTo.x,v.lineTo.y)};let key=v.cubicBezTo?'cubicBezTo':'quadBezTo',q=v[key],p=pt(q.x,q.y),p1=pt(q.x1,q.y1),res={...p,x1:p1.x,y1:p1.y};if(q.x2!==undefined){const p2=pt(q.x2,q.y2);res.x2=p2.x;res.y2=p2.y;}return{[key]:res};});}
