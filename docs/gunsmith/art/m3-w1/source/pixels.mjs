// Standalone integer-grid authoring/export support; Node built-ins only.
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
export const rgba = hex => [...hex.replace('#','').match(/../g).map(x=>parseInt(x,16)),255];
export function canvas(w,h) { return {w,h,data:Buffer.alloc(w*h*4),ops:[]}; }
export function dot(c,x,y,color) {
  if(x<0||y<0||x>=c.w||y>=c.h) return;
  c.data.set(typeof color==='string'?rgba(color):color,(y*c.w+x)*4);
}
export function rect(c,color,x,y,w,h) {
  c.ops.push(['r',color,x,y,w,h]);
  const pixel=typeof color==='string'?rgba(color):color;
  for(let j=y;j<y+h;j++) for(let i=x;i<x+w;i++) dot(c,i,j,pixel);
}
export function poly(c,color,points) {
  c.ops.push(['p',color,points]);
  const pixel=typeof color==='string'?rgba(color):color;
  const min=Math.min(...points.map(p=>p[1])),max=Math.max(...points.map(p=>p[1]));
  for(let y=min;y<max;y++) {
    const edges=[];
    points.forEach(([x1,y1],i)=>{const [x2,y2]=points[(i+1)%points.length];
      if((y1<=y+.5&&y2>y+.5)||(y2<=y+.5&&y1>y+.5)) edges.push(x1+(y+.5-y1)*(x2-x1)/(y2-y1));});
    edges.sort((a,b)=>a-b);
    for(let i=0;i+1<edges.length;i+=2) for(let x=Math.ceil(edges[i]-.5);x<Math.ceil(edges[i+1]-.5);x++) dot(c,x,y,pixel);
  }
}
export function blit(dst,src,x,y,scale=1,gray=false) {
  // A fractional row would otherwise become a horizontal byte offset in the RGBA buffer.
  if(!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(scale)||scale<1)throw Error('Pixel blit requires integer translation and scale');
  for(let j=0;j<src.h;j++) for(let i=0;i<src.w;i++) {
    let p=Array.from(src.data.subarray((j*src.w+i)*4,(j*src.w+i)*4+4));
    if(!p[3]) continue;
    if(gray) {const l=Math.round(.2126*p[0]+.7152*p[1]+.0722*p[2]);p=[l,l,l,p[3]];}
    for(let v=0;v<scale;v++) for(let u=0;u<scale;u++) dot(dst,x+i*scale+u,y+j*scale+v,p);
  }
}
export function crop(c,x,y,w,h) {const d=canvas(w,h);blit(d,c,-x,-y);return d;}
export function colors(c) {const s=new Set();for(let i=0;i<c.data.length;i+=4) if(c.data[i+3])s.add(c.data.subarray(i,i+3).toString('hex'));return s.size;}
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(b) {let n=0xffffffff;for(const v of b)n=table[(n^v)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function chunk(type,b) {const t=Buffer.from(type),out=Buffer.alloc(b.length+12);out.writeUInt32BE(b.length);t.copy(out,4);b.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([t,b])),b.length+8);return out;}
export function png(c) {
  const ih=Buffer.alloc(13);ih.writeUInt32BE(c.w);ih.writeUInt32BE(c.h,4);ih[8]=8;ih[9]=6;
  const raw=Buffer.alloc(c.h*(1+c.w*4));for(let y=0;y<c.h;y++)c.data.copy(raw,y*(1+c.w*4)+1,y*c.w*4,(y+1)*c.w*4);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ih),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
export const save=(path,c)=>writeFileSync(path,png(c));
export function decode(path) {
  const b=readFileSync(path),ids=[];let w,h,depth,type,palette,alpha;
  if(b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('not PNG: '+path);
  for(let o=8;o<b.length;) {const len=b.readUInt32BE(o),name=b.toString('ascii',o+4,o+8),d=b.subarray(o+8,o+8+len);
    if(crc32(b.subarray(o+4,o+8+len))!==b.readUInt32BE(o+8+len))throw Error('PNG CRC: '+path);
    if(name==='IHDR'){w=d.readUInt32BE();h=d.readUInt32BE(4);depth=d[8];type=d[9];if(d[12])throw Error('interlaced PNG');}
    if(name==='PLTE')palette=d;if(name==='tRNS')alpha=d;if(name==='IDAT')ids.push(d);o+=len+12;}
  const channels={0:1,2:3,3:1,4:2,6:4}[type];if(!channels||![1,2,4,8].includes(depth)||depth<8&&type!==3)throw Error('unsupported PNG '+type+'/'+depth);
  const stride=Math.ceil(w*channels*depth/8),bpp=Math.max(1,Math.ceil(channels*depth/8)),raw=inflateSync(Buffer.concat(ids)),rows=[];
  for(let y=0;y<h;y++) {const row=Buffer.from(raw.subarray(y*(stride+1)+1,(y+1)*(stride+1))),f=raw[y*(stride+1)],prior=rows[y-1];
    for(let x=0;x<stride;x++){const a=x>=bpp?row[x-bpp]:0,up=prior?.[x]??0,ul=x>=bpp?(prior?.[x-bpp]??0):0,p=a+up-ul,pa=Math.abs(p-a),pb=Math.abs(p-up),pc=Math.abs(p-ul);
      row[x]=(row[x]+(f===0?0:f===1?a:f===2?up:f===3?Math.floor((a+up)/2):f===4?(pa<=pb&&pa<=pc?a:pb<=pc?up:ul):(()=>{throw Error('filter');})()))&255;}
    rows.push(row);}
  const c=canvas(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const r=rows[y],i=x*channels;let p;
    if(type===6)p=[...r.subarray(i,i+4)];if(type===2)p=[...r.subarray(i,i+3),255];if(type===0)p=[r[i],r[i],r[i],255];if(type===4)p=[r[i],r[i],r[i],r[i+1]];
    if(type===3){const n=depth===8?r[x]:(r[Math.floor(x*depth/8)]>>>(8-depth-(x*depth)%8))&((1<<depth)-1);p=[...palette.subarray(n*3,n*3+3),alpha?.[n]??255];}
    dot(c,x,y,p);}
  return c;
}
// Only preview labels use this tiny font. Runtime sprites contain no typography.
const font={A:['010','101','111','101','101'],B:['110','101','110','101','110'],C:['011','100','100','100','011'],D:['110','101','101','101','110'],E:['111','100','110','100','111'],F:['111','100','110','100','100'],G:['011','100','101','101','011'],H:['101','101','111','101','101'],I:['111','010','010','010','111'],K:['101','101','110','101','101'],L:['100','100','100','100','111'],M:['10001','11011','10101','10101','10101'],N:['101','111','111','111','101'],O:['010','101','101','101','010'],P:['110','101','110','100','100'],Q:['010','101','101','111','011'],R:['110','101','110','101','101'],S:['011','100','010','001','110'],T:['111','010','010','010','010'],U:['101','101','101','101','111'],V:['101','101','101','101','010'],W:['10101','10101','10101','11011','10001'],X:['101','101','010','101','101'],Y:['101','101','010','010','010'],0:['111','101','101','101','111'],1:['010','110','010','010','111'],2:['110','001','111','100','111'],3:['110','001','010','001','110'],4:['101','101','111','001','001'],5:['111','100','110','001','110'],6:['011','100','111','101','111'],7:['111','001','010','010','010'],8:['111','101','111','101','111'],9:['111','101','111','001','110'],'-':['000','000','111','000','000'],'.':['0','0','0','0','1'],'/':['001','001','010','100','100'],':':['0','1','0','1','0']};
export function text(c,str,x,y,color='#bdcfca',scale=1) {for(const ch of str.toUpperCase()){const g=font[ch];if(g){g.forEach((row,j)=>[...row].forEach((v,i)=>{if(v==='1')rect(c,color,x+i*scale,y+j*scale,scale,scale);}));x+=(g[0].length+1)*scale;}else x+=4*scale;}}
