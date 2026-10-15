const fs = require('fs');
const path = require('path');
module.exports = async (win, app, emit, config) => {
  try {
    const initial = await win.webContents.executeJavaScript(
      `({rows:document.querySelectorAll('.message').length,fresh:['twitch','kick','starvios'].every(p=>document.getElementById(p+'-channel').value===''),starvios:!!document.getElementById('starvios-sound'),fonts:document.querySelector('#fontFamily').options.length})`,
    );
    const changed = await win.webContents.executeJavaScript(
      `(async()=>{const change=(id,value)=>{const el=document.getElementById(id);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};change('fontFamily','Arial');change('fontWeight',700);change('textColor','#fef08a');change('preserveNames',false);change('shadowColor','#000000');change('shadowBlur',8);change('shadowX',2);change('shadowY',3);change('shadowOpacity',90);const row=document.querySelector('.message');const c=getComputedStyle(row);const result={family:c.fontFamily,color:c.color,weight:c.fontWeight,shadow:c.textShadow,name:getComputedStyle(row.querySelector('.user')).color};change('shadowEnabled',false);result.disabledShadow=getComputedStyle(row).textShadow;change('shadowEnabled',true);document.getElementById('save-style').click();for(let i=0;i<40&&!document.getElementById('style-status').textContent.includes('salva');i++)await new Promise(r=>setTimeout(r,50));result.saved=document.getElementById('style-status').textContent.includes('salva');return result;})()`,
    );
    const disk = JSON.parse(fs.readFileSync(config(), 'utf8'));
    await win.reload();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const restored = await win.webContents.executeJavaScript(
      `({font:document.getElementById('fontFamily').value,color:document.getElementById('textColor').value,shadow:document.getElementById('shadowBlur').value,names:document.getElementById('preserveNames').checked})`,
    );
    emit('message', {
      platform: 'twitch',
      id: 'preview-t',
      user: 'PessoaTwitch',
      text: 'Agora o chat tem a sua identidade ✨',
      color: '#bb99ff',
    });
    emit('message', {
      platform: 'kick',
      id: 'preview-k',
      user: 'PessoaKick',
      text: 'Fonte, cor e sombra do seu jeito 💚',
      color: '#53fc18',
    });
    emit('message', {
      platform: 'starvios',
      id: 'preview-s',
      user: 'PessoaStarvios',
      text: 'Starvios no mesmo painel 💙',
      color: '#69d9ff',
      historical: true,
    });
    await win.webContents.executeJavaScript(
      `document.getElementById('type-panel').open=true;document.getElementById('type-panel').scrollIntoView({block:'start'});`,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    const passed =
      initial.rows === 2 &&
      initial.fresh &&
      initial.starvios &&
      initial.fonts >= 8 &&
      changed.family.includes('Arial') &&
      changed.color === 'rgb(254, 240, 138)' &&
      changed.weight === '700' &&
      changed.name === changed.color &&
      changed.shadow.includes('8px') &&
      changed.disabledShadow === 'none' &&
      changed.saved &&
      disk.appearance.fontFamily === 'Arial' &&
      restored.font === 'Arial' &&
      restored.color === '#fef08a' &&
      restored.shadow === '8' &&
      restored.names === false;
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, 'preview.png'), image.toPNG());
    await win.webContents.executeJavaScript(`window.kaia.window('overlay')`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const transparent = await win.webContents.executeJavaScript(
      `({background:getComputedStyle(document.body).backgroundColor,border:getComputedStyle(document.body).borderTopWidth,header:getComputedStyle(document.querySelector('header')).display,toolbar:getComputedStyle(document.querySelector('.toolbar')).display,feed:getComputedStyle(document.getElementById('feed')).backgroundColor,rows:document.querySelectorAll('.message').length})`,
    );
    const overlayImage = await win.webContents.capturePage();
    fs.writeFileSync(
      path.join(__dirname, 'preview-transparent.png'),
      overlayImage.toPNG(),
    );
    const alpha = overlayImage.toBitmap()[3];
    await win.webContents.executeJavaScript(`window.kaia.window('overlay')`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const recovered = await win.webContents.executeJavaScript(
      `!document.body.classList.contains('overlay')&&getComputedStyle(document.querySelector('header')).display!=='none'`,
    );
    const overlayPassed =
      transparent.background === 'rgba(0, 0, 0, 0)' &&
      transparent.border === '0px' &&
      transparent.header === 'none' &&
      transparent.toolbar === 'none' &&
      transparent.feed === 'rgba(0, 0, 0, 0)' &&
      transparent.rows === 3 &&
      alpha === 0 &&
      recovered;
    const result = {
      passed: passed && overlayPassed,
      initial,
      changed,
      restored,
      transparent,
      alpha,
      recovered,
    };
    fs.writeFileSync(
      path.join(__dirname, 'smoke-result.json'),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    app.exit(result.passed ? 0 : 1);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
};
