const fs = require('fs');
const path = require('path');
module.exports = async (win, app, emit, config, transcript) => {
  try {
    const initial = await win.webContents.executeJavaScript(
      `({rows:document.querySelectorAll('.message').length,fresh:['twitch','kick','starvios','custom'].every(p=>document.getElementById(p+'-channel').value===''),starvios:!!document.getElementById('starvios-sound'),custom:!!document.getElementById('custom-url'),fonts:document.querySelector('#fontFamily').options.length})`,
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
      initial.custom &&
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
    emit('message', {
      platform: 'twitch',
      id: 'existing-spam',
      login: 'spammer',
      user: 'Outro Nome',
      text: 'Mensagem anterior ao bloqueio',
      historical: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const savedBlocks = await win.webContents.executeJavaScript(
      `(async()=>{document.getElementById('all-blocked').value='@GlobalBot, globalbot';document.getElementById('twitch-blocked').value='@SpAmMeR';document.getElementById('starvios-blocked').value='SVBot';document.getElementById('save-blocked').click();for(let i=0;i<40&&!document.getElementById('blocked-status').textContent.includes('salvos');i++)await new Promise(r=>setTimeout(r,50));window.__blockedAudioCalls=0;window.__blockedDeliveries=0;HTMLMediaElement.prototype.play=function(){window.__blockedAudioCalls++;return Promise.resolve();};window.kaia.on('message',()=>window.__blockedDeliveries++);return{saved:document.getElementById('blocked-status').textContent.includes('salvos'),removed:!document.querySelector('[data-message-id="existing-spam"]')};})()`,
    );
    for (const m of [
      { platform: 'twitch', login: 'SPAMMER' },
      { platform: 'kick', login: 'GLOBALBOT' },
      { platform: 'starvios', login: 'globalbot' },
      { platform: 'starvios', login: 'SVBOT' },
    ])
      emit('message', {
        ...m,
        id: 'blocked-' + m.platform + '-' + m.login,
        user: 'Nome de exibição',
        text: 'Esta mensagem deve ser bloqueada',
      });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const rejected = await win.webContents.executeJavaScript(
      `({delivered:window.__blockedDeliveries,sounds:window.__blockedAudioCalls})`,
    );
    emit('message', {
      platform: 'kick',
      id: 'allowed-other-platform',
      login: 'spammer',
      user: 'Spammer',
      text: 'Permitido em outra plataforma',
      historical: true,
    });
    emit('message', {
      platform: 'twitch',
      id: 'allowed-exact',
      login: 'spammer_extra',
      user: 'Spammer_extra',
      text: 'Nome diferente permanece visível',
      historical: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const allowed = await win.webContents.executeJavaScript(
      `!!document.querySelector('[data-message-id="allowed-other-platform"]')&&!!document.querySelector('[data-message-id="allowed-exact"]')`,
    );
    const blockedDisk = JSON.parse(
      fs.readFileSync(config(), 'utf8'),
    ).blockedUsers;
    await win.reload();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const persistedBlocks = await win.webContents.executeJavaScript(
      `document.getElementById('all-blocked').value==='globalbot'&&document.getElementById('twitch-blocked').value==='spammer'&&document.getElementById('starvios-blocked').value==='svbot'`,
    );
    await win.webContents.executeJavaScript(
      `document.getElementById('blocked-panel').open=true;document.getElementById('blocked-panel').scrollIntoView({block:'start'});`,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    fs.writeFileSync(
      path.join(__dirname, 'preview-blocked.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    const blockingPassed =
      savedBlocks.saved &&
      savedBlocks.removed &&
      rejected.delivered === 0 &&
      rejected.sounds === 0 &&
      allowed &&
      persistedBlocks &&
      blockedDisk.twitch[0] === 'spammer';
    const timingSaved = await win.webContents.executeJavaScript(
      `(async()=>{document.getElementById('expiry-enabled').checked=true;document.getElementById('expiry-seconds').value='1';document.getElementById('expiry-fade').value='0.4';await document.getElementById('save-timing').onclick();return document.getElementById('expiry-status').textContent.includes('salvo');})()`,
    );
    emit('message', {
      platform: 'kick',
      id: 'expiry-demo',
      login: 'expirytest',
      user: 'TesteFade',
      text: 'Mensagem com tempo individual',
      historical: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 1150));
    const fading = await win.webContents.executeJavaScript(
      `(()=>{const row=document.querySelector('[data-message-id="expiry-demo"]');return !!row&&row.classList.contains('message-fading')&&Number(getComputedStyle(row).opacity)<1;})()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    const expired = await win.webContents.executeJavaScript(
      `!document.querySelector('[data-message-id="expiry-demo"]')`,
    );
    await win.reload();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const timingPersisted = await win.webContents.executeJavaScript(
      `document.getElementById('expiry-enabled').checked&&document.getElementById('expiry-seconds').value==='1'&&document.getElementById('expiry-fade').value==='0.4'`,
    );
    await win.webContents.executeJavaScript(
      `(async()=>{document.getElementById('expiry-enabled').checked=false;await document.getElementById('save-timing').onclick();})()`,
    );
    emit('message', {
      platform: 'kick',
      id: 'expiry-disabled',
      user: 'TesteSemFade',
      text: 'Permanece quando o temporizador está desativado',
      historical: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 1600));
    const retained = await win.webContents.executeJavaScript(
      `!!document.querySelector('[data-message-id="expiry-disabled"]')`,
    );
    await win.webContents.executeJavaScript(`window.kaia.window('clear')`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const timersCleared = await win.webContents.executeJavaScript(
      `messageExpiry.entries.size===0`,
    );
    await win.webContents.executeJavaScript(
      `document.getElementById('timing-panel').open=true;document.getElementById('timing-panel').scrollIntoView({block:'start'});`,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    fs.writeFileSync(
      path.join(__dirname, 'preview-timing.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    const timingPassed =
      timingSaved &&
      fading &&
      expired &&
      timingPersisted &&
      retained &&
      timersCleared;
    const customSaved = await win.webContents.executeJavaScript(
      `(async()=>{const data=await window.kaia.load();for(const p of ['twitch','kick','starvios','custom'])data[p].enabled=false;Object.assign(data.custom,{name:'Minha plataforma',channel:'canal',url:'https://example.com/chat/{channel}',itemsPath:'data.messages',userPath:'sender.nick',textPath:'body',idPath:'id'});const saved=await window.kaia.save(data);apply(saved);return document.getElementById('custom-name').value==='Minha plataforma'&&document.getElementById('custom-itemsPath').value==='data.messages'&&!!document.getElementById('transcript-path').value;})()`,
    );
    await transcript.flush();
    const backup = fs.readFileSync(
      JSON.parse(fs.readFileSync(config(), 'utf8')).transcriptPath,
      'utf8',
    );
    const backupPassed =
      backup.includes('Esta mensagem deve ser bloqueada') &&
      backup.includes('Mensagem com tempo individual');
    const result = {
      passed:
        passed &&
        overlayPassed &&
        blockingPassed &&
        timingPassed &&
        backupPassed &&
        customSaved,
      initial,
      changed,
      restored,
      transparent,
      alpha,
      recovered,
      blocking: { savedBlocks, rejected, allowed, persisted: persistedBlocks },
      timing: {
        saved: timingSaved,
        fading,
        expired,
        persisted: timingPersisted,
        retained,
        timersCleared,
      },
      backup: { passed: backupPassed, messages: transcript.count },
      customSaved,
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
