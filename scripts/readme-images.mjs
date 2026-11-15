/** Renders github/assets/hero.png and alarm.png from the built website keys (npm run site first). */
import sharp from "sharp";
const [dir = "website/dist/keys", out = "github/assets/hero.png"] = process.argv.slice(2);
const files = ["bao-printing","compact-time","temps","tray-a1","tray-a2","tray-a3","humidity-ht","speed","stop","light"];
const K=144,G=16;const comps=[];
for (let i=0;i<files.length;i++){const x=i%5,y=Math.floor(i/5);comps.push({input:await sharp(`${dir}/${files[i]}.svg`,{density:200}).resize(K,K).png().toBuffer(),left:G+x*(K+G),top:G+y*(K+G)});}
await sharp({create:{width:G+5*(K+G),height:G+2*(K+G),channels:4,background:"#24272B"}}).composite(comps).png().toFile(out);
const d=[];for(let r=0;r<3;r++)for(let c=0;c<5;c++)d.push({input:await sharp(`${dir}/alarm-done-${r}-${c}.svg`,{density:200}).resize(K,K).png().toBuffer(),left:G+c*(K+G),top:G+r*(K+G)});
await sharp({create:{width:G+5*(K+G),height:G+3*(K+G),channels:4,background:"#24272B"}}).composite(d).png().toFile(out.replace("hero","alarm"));
