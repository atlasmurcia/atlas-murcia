const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync(__dirname + '/../atlas.html', 'utf8');
// Parse every inline script without executing authentication or clinical code.
for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!/\bsrc=/.test(match[1])) new vm.Script(match[2]);
}
const styles = [...source.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map(m => m[0]).join('\n');
const footerScript = source.match(/<script id="atlas-session-footer-layout-v1">([\s\S]*?)<\/script>/)[1];
const fixture = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">${styles}
<div class="shell"><main class="stage"><iframe class="module on" id="agendaFrame"></iframe></main></div>
<div id="atlasUserBar" class="atlas-userbar"><span id="atlasUserName">Persona de prueba</span><button>Salir</button></div>
<button id="atlasRecordedCallsLauncher">☎ Llamadas</button><button id="atlasInternalChatLauncher">💬 Chat interno <span>12</span></button>
<script>${footerScript}</script>`;
const form = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;font:16px Arial;background:#f5f7f8}header{padding:24px;background:white}h2{max-width:180px}section{margin:16px;padding:16px;background:white;border:1px solid #dce4eb;border-radius:14px}label{display:block;margin:16px 0}select{width:100%;padding:12px}button{padding:12px;border:1px solid #dce4eb;border-radius:10px}.callout{padding:12px;background:#effafe;line-height:1.5}.actions{display:flex;justify-content:flex-end;gap:8px}#saveAttendanceEntry{background:#00b0e4;color:white}
</style><header><button>‹ Escritorio</button><h2>Fichar · Persona de prueba</h2></header><section><h2>Registrar salida</h2><div class="callout">El registro guardará fecha y hora exactas. La verificación fotográfica solo se activará en un despliegue HTTPS autorizado.</div><label>Empleado<select disabled><option>Persona de prueba</option></select></label><label><input type="checkbox"> Solicitar fotografía cuando esté disponible</label><div class="actions"><button>Cancelar</button><button id="saveAttendanceEntry" onclick="this.dataset.clicked='yes'">Guardar</button></div></section>`;
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  for (const [width,height] of [[320,568],[375,667],[390,650],[430,800],[667,375],[720,600],[1280,900]]) {
   await page.setViewportSize({width,height});
   await page.setContent(fixture);
   const iframe = page.locator('#agendaFrame');
   await iframe.evaluate((el,html) => el.srcdoc=html,form);
   const save = page.frameLocator('#agendaFrame').locator('#saveAttendanceEntry');
   await save.scrollIntoViewIfNeeded();
   if(width<=720) {
    const frameBox=await iframe.boundingBox();
    const callsBox=await page.locator('#atlasRecordedCallsLauncher').boundingBox();
    const chatBox=await page.locator('#atlasInternalChatLauncher').boundingBox();
    assert(frameBox.y+frameBox.height<=Math.min(callsBox.y,chatBox.y),'utilities must stay outside the module');
    assert(callsBox.x+callsBox.width<chatBox.x,'utility buttons must not overlap');
    await save.click({timeout:3000});
    assert.equal(await save.getAttribute('data-clicked'),'yes');
    // A taller footer must also move the reserved rail and retain a clickable form.
    await page.locator('#atlasUserBar').evaluate(el=>el.style.minHeight='80px');
    await page.waitForTimeout(60);
    await save.scrollIntoViewIfNeeded();await save.click({timeout:3000});
    const bottom=await iframe.boundingBox(),chat=await page.locator('#atlasInternalChatLauncher').boundingBox();
    assert(bottom.y+bottom.height<=chat.y);
    if(width===390)await page.screenshot({path:__dirname+'/movil-corregido.png'});
    // Capture keeps its existing footer controls and module height.
    await page.evaluate(()=>document.body.classList.add('atlas-capture-mode'));
    assert.equal(Math.round((await iframe.boundingBox()).height),height-80);
   } else {
    assert.equal(Math.round((await iframe.boundingBox()).height),height-48);
   }
   console.log(`PASS ${width}x${height}`);
  }
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
