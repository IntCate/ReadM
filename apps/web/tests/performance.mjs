import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,...(process.env.PIANO_CHROMIUM_PATH?{executablePath:process.env.PIANO_CHROMIUM_PATH}:{})});
const page=await browser.newPage({viewport:{width:1500,height:1050}});
try{
  await page.goto(process.env.PIANO_TEST_URL??'http://127.0.0.1:5173');await page.locator('.save-indicator').filter({hasText:'已保存至本机'}).waitFor();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/100-measures.pianoscore.json');await page.locator('.save-indicator').filter({hasText:'已保存至本机'}).waitFor();
  assert.equal(await page.getByText('排版失败',{exact:false}).count(),0);
  const timings=await page.evaluate(async()=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));const samples=[];
    for(let i=0;i<100;i++){
      const select=document.querySelector('select[aria-label="修改音名"]');select.value=i%2?'D':'F';select.dispatchEvent(new Event('change',{bubbles:true}));await frame();
      const start=performance.now();[...document.querySelectorAll('button')].find(b=>b.textContent==='应用音高').click();await frame();await frame();samples.push(performance.now()-start);
    }return samples;
  });
  await page.locator('.save-indicator').filter({hasText:'已保存至本机'}).waitFor();const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出项目',exact:true}).click();const file=await download;const exported=JSON.parse(await fs.readFile(await file.path(),'utf8'));assert.equal(exported.revision,100,'必须确实提交 100 次编辑');timings.sort((a,b)=>a-b);const report={date:new Date().toISOString(),environment:await page.evaluate(()=>({userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,viewport:[innerWidth,innerHeight]})),fixture:'100-measures.pianoscore.json',commands:100,buildMode:process.env.PIANO_BUILD_MODE??'unspecified',baseURL:process.env.PIANO_TEST_URL??'http://127.0.0.1:5173',method:'真实音高修改按钮点击至后两个 animationFrame；热态、单机结果',medianMs:timings[49],p95Ms:timings[94],maxMs:timings[99],targetMs:100};
  await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/performance.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));assert.ok(report.p95Ms<=100,'100 小节编辑 p95 超过 100ms 目标');
}finally{await browser.close();}
