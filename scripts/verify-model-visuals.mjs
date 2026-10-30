import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {chromium} from 'playwright';
const out='reports/optimization/visuals';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const errors=[],results=[];
const variants=process.argv.includes('--variants')?['original','balanced','vertex']:['original','balanced'];
// Structural similarity evaluated only in blocks occupied by either character,
// excluding the empty background so it cannot inflate the score.
async function metrics(a,b){
 const x=await sharp(a).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const y=await sharp(b).ensureAlpha().raw().toBuffer();
 let intersection=0,union=0,error=0,pixels=0,score=0,blocks=0;
 for(let by=0;by<x.info.height;by+=8)for(let bx=0;bx<x.info.width;bx+=8){
  const aa=[],bb=[];let occupied=0;
  for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){
   const i=((by+dy)*x.info.width+bx+dx)*4;
   const ma=x.data[i+3]>127,mb=y[i+3]>127;
   if(ma&&mb)intersection++;if(ma||mb){union++;occupied++;pixels++;
    for(let c=0;c<3;c++)error+=Math.abs(x.data[i+c]-y[i+c]);}
   // Composite onto the same neutral background for edge comparisons.
   const lum=(d)=>((.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])*d[i+3]/255+180*(1-d[i+3]/255));
   aa.push(lum(x.data));bb.push(lum(y));
  }
  if(!occupied)continue;
  const mean=q=>q.reduce((s,v)=>s+v,0)/q.length,ma=mean(aa),mb=mean(bb);
  let va=0,vb=0,cov=0;for(let i=0;i<aa.length;i++){va+=(aa[i]-ma)**2;vb+=(bb[i]-mb)**2;cov+=(aa[i]-ma)*(bb[i]-mb);}
  va/=63;vb/=63;cov/=63;
  score+=((2*ma*mb+6.5025)*(2*cov+58.5225))/((ma*ma+mb*mb+6.5025)*(va+vb+58.5225))*occupied;
  blocks+=occupied;
 }
 return {foregroundSSIM:score/blocks,silhouetteIoU:intersection/union,meanRGBError:error/(pixels*3*255)};
}
try{
 const page=await browser.newPage({viewport:{width:variants.length*384,height:570}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.ANKA_QA_URL||'http://127.0.0.1:5187')+'/scripts/model-review.html');
 await page.waitForFunction(()=>window.ready);
 for(const kind of ['male_scout','female_striker']){
  for(const [clip,fraction,angle]of [['AimIdle',.4,0],['AimIdle',.4,.9],['Idle',.4,Math.PI],['Run',.35,.4],['CrouchIdle',.5,0],['Roll',.5,.8],['Reload',.5,.3],['Death',.75,.8]]){
   const frames={};
   for(const variant of variants){
    const data=await page.evaluate(async args=>window.capture(...args),[kind,variant,clip,fraction,angle]);
    frames[variant]=Buffer.from(data.split(',')[1],'base64');
    await fs.writeFile(`${out}/${kind}-${clip}-${angle}-${variant}.png`,frames[variant]);
   }
   for(const variant of variants.filter(v=>v!=='original')){
    const result={kind,clip,angle,variant,...await metrics(frames.original,frames[variant])};
    results.push(result);console.log(JSON.stringify(result));
   }
  }
  await page.evaluate(({kind,includeVertex})=>window.compare(kind,'AimIdle',.4,0,includeVertex),{kind,includeVertex:variants.includes('vertex')});
  await page.screenshot({path:`${out}/${kind}-comparison.png`});
 }
 const balanced=results.filter(r=>r.variant==='balanced');
 const summary={averageSSIM:balanced.reduce((s,r)=>s+r.foregroundSSIM,0)/balanced.length,
  minimumSSIM:Math.min(...balanced.map(r=>r.foregroundSSIM)),minimumSilhouetteIoU:Math.min(...balanced.map(r=>r.silhouetteIoU))};
 await fs.writeFile('reports/optimization/visuals.json',JSON.stringify({summary,errors,results},null,2)+'\n');
 assert.deepEqual(errors,[]);assert.ok(summary.minimumSSIM>=.9,JSON.stringify(summary));
 assert.ok(summary.minimumSilhouetteIoU>=.97,JSON.stringify(summary));console.log('VISUAL GATE PASSED',summary);
}finally{await browser.close();}
