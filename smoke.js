const fs = require('fs');
const path = require('path');
module.exports = async (win, app, emit, config, transcript) => {
  const domOnly = process.argv.includes('--smoke-dom-only');
  async function screenshot(contents, name) {
    if (domOnly) return null;
    const image = await contents.capturePage();
    fs.writeFileSync(path.join(__dirname, name), image.toPNG());
    return image;
  }
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
    await screenshot(win.webContents, 'preview.png');
    await win.webContents.executeJavaScript(`window.kaia.window('overlay')`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const transparent = await win.webContents.executeJavaScript(
      `({background:getComputedStyle(document.body).backgroundColor,border:getComputedStyle(document.body).borderTopWidth,header:getComputedStyle(document.querySelector('header')).display,toolbar:getComputedStyle(document.querySelector('.toolbar')).display,feed:getComputedStyle(document.getElementById('feed')).backgroundColor,rows:document.querySelectorAll('.message').length})`,
    );
    const overlayImage = await screenshot(
      win.webContents,
      'preview-transparent.png',
    );
    const alpha = overlayImage ? overlayImage.toBitmap()[3] : null;
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
      (domOnly || alpha === 0) &&
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
    await screenshot(win.webContents, 'preview-blocked.png');
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
      `(()=>{const row=document.querySelector('[data-message-id="expiry-demo"]');return !!row&&row.classList.contains('message-fading')&&(${domOnly}||Number(getComputedStyle(row).opacity)<1);})()`,
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
    await screenshot(win.webContents, 'preview-timing.png');
    const timingPassed =
      timingSaved &&
      fading &&
      expired &&
      timingPersisted &&
      retained &&
      timersCleared;
    const controls = await win.webContents.executeJavaScript(`(async()=>{
      document.getElementById('settings-toggle').click(); await new Promise(r=>setTimeout(r,100));
      const collapsed=getComputedStyle(document.getElementById('setup')).display==='none'&&getComputedStyle(document.querySelector('.toolbar')).display!=='none'&&!document.body.classList.contains('overlay');
      window.kaia.window('restore'); await new Promise(r=>setTimeout(r,100));
      document.getElementById('tab-widget').click();
      document.getElementById('widget-layout').value='cards'; document.getElementById('widget-css').value='.message { border-radius: 19px; }';
      await document.getElementById('save-widget').onclick();
      const saved=await window.kaia.load();
      return {collapsed,widget:saved.widget.layout==='cards'&&saved.widget.css.includes('19px'),url:saved.widgetUrl};
    })()`);
    await win.webContents.executeJavaScript(
      `document.getElementById('hide').click()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    controls.hidden =
      win.isVisible() &&
      !win.isFocusable() &&
      (await win.webContents.executeJavaScript(
        `document.body.classList.contains('overlay')&&!document.body.classList.contains('widget-tab')&&!document.body.classList.contains('feature-tab')&&getComputedStyle(document.getElementById('feed')).display!=='none'&&getComputedStyle(document.body).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(document.querySelector('.toolbar')).display==='none'`,
      ));
    await win.webContents.executeJavaScript(`window.kaia.window('restore')`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    controls.restored =
      win.isVisible() &&
      win.isFocusable() &&
      (await win.webContents.executeJavaScript(
        `!document.body.classList.contains('settings-collapsed')&&!document.body.classList.contains('widget-tab')`,
      ));
    const { BrowserWindow } = require('electron');
    const widgetTest = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    widgetTest.webContents.on('console-message', (_event, details) =>
      console.log('WIDGET:', details.message),
    );
    await widgetTest.loadURL(controls.url);
    emit('message', {
      platform: 'twitch',
      id: 'widget-native',
      user: 'WidgetTest',
      text: 'Kappa <script>teste</script>',
      emotes: '25:0-4',
      historical: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    controls.rendered = await widgetTest.webContents.executeJavaScript(
      `(()=>{const row=document.querySelector('[data-id="widget-native"]');return !!row&&row.querySelector('img')?.alt==='Kappa'&&row.querySelector('.message-text').textContent.includes('<script>')&&document.body.dataset.layout==='cards'&&getComputedStyle(row).borderRadius==='19px';})()`,
    );
    await win.webContents.executeJavaScript(
      `document.getElementById('tab-widget').click()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    const previewFrame = win.webContents.mainFrame.frames.find(
      (frame) => frame.url === controls.url,
    );
    controls.preview =
      !!previewFrame &&
      (await previewFrame.executeJavaScript(
        `document.body.dataset.layout==='cards'&&!!document.querySelector('[data-id="widget-native"]')`,
      ));
    await screenshot(win.webContents, 'preview-widget-editor.png');
    await win.webContents.executeJavaScript(
      `document.getElementById('tab-chat').click()`,
    );
    controls.widgetDetails = await widgetTest.webContents.executeJavaScript(
      `({html:document.getElementById('feed').innerHTML,layout:document.body.dataset.layout,config:typeof config==='undefined'?null:config,css:document.getElementById('custom-css').textContent})`,
    );
    await screenshot(widgetTest.webContents, 'preview-widget.png');
    widgetTest.destroy();
    const widgetPassed =
      controls.collapsed &&
      controls.widget &&
      controls.hidden &&
      controls.restored &&
      controls.preview &&
      controls.rendered;
    const customSaved = await win.webContents.executeJavaScript(
      `(async()=>{const data=await window.kaia.load();for(const p of ['twitch','kick','starvios','custom'])data[p].enabled=false;Object.assign(data.custom,{name:'Minha plataforma',channel:'canal',url:'https://example.com/chat/{channel}',itemsPath:'data.messages',userPath:'sender.nick',textPath:'body',idPath:'id'});const saved=await window.kaia.save(data);apply(saved);return document.getElementById('custom-name').value==='Minha plataforma'&&document.getElementById('custom-itemsPath').value==='data.messages'&&!!document.getElementById('transcript-path').value;})()`,
    );
    const windowTests = {};
    const originalBounds = win.getBounds();
    await win.webContents.executeJavaScript(
      `document.getElementById('fullscreen').click()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    windowTests.maximized =
      win.isMaximized() &&
      (await win.webContents.executeJavaScript(
        `document.body.classList.contains('fullscreen')`,
      ));
    await screenshot(win.webContents, 'preview-maximized.png');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    await new Promise((resolve) => setTimeout(resolve, 250));
    windowTests.restored =
      !win.isMaximized() && win.getBounds().width === originalBounds.width;
    windowTests.sizes = [];
    for (const size of [
      [340, 500],
      [320, 300],
      [510, 860],
      [960, 650],
    ]) {
      win.setSize(...size);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const layout = await win.webContents.executeJavaScript(`(()=>{
        document.getElementById('tab-chat').click();
        const toolbar=document.querySelector('.toolbar').getBoundingClientRect();
        const buttons=[...document.querySelectorAll('.toolbar button')].map(b=>b.getBoundingClientRect());
        const brandBox=document.querySelector(".brand").getBoundingClientRect(),languageBox=document.getElementById("language-toggle").getBoundingClientRect(); const headerOK=brandBox.right<=languageBox.left+1&&languageBox.right<=innerWidth-130; const chatOK=headerOK&&document.body.scrollWidth<=innerWidth&&buttons.every(b=>b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight)&&toolbar.bottom<=innerHeight;
        document.getElementById('tab-widget').click();
        const panel=document.getElementById('widget-panel');
        const widgetOK=panel.scrollWidth<=panel.clientWidth;
        document.getElementById('tab-chat').click();
        return {width:innerWidth,height:innerHeight,chatOK,widgetOK,toolbarBottom:toolbar.bottom,bodyWidth:document.body.scrollWidth,buttonBounds:buttons.map(b=>({left:b.left,right:b.right,bottom:b.bottom}))};
      })()`);
      windowTests.sizes.push(layout);
    }
    win.setBounds(originalBounds);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F11' });
    await new Promise((resolve) => setTimeout(resolve, 250));
    windowTests.f11 = win.isMaximized();
    await win.webContents.executeJavaScript(`window.kaia.window('restore')`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    windowTests.recovery = !win.isMaximized();
    const windowPassed =
      windowTests.maximized &&
      windowTests.restored &&
      windowTests.f11 &&
      windowTests.recovery &&
      windowTests.sizes.every((s) => s.chatOK && s.widgetOK);
    const mediaTests = await win.webContents.executeJavaScript(`(async()=>{
      document.getElementById('tab-reader').click();
      const data=await window.kaia.load();
      const saved=await window.kaia.saveReader({...data.reader,enabled:false,every:3,lowEvery:5,high:'@Vip,VIP',low:'Pouco'});
      const diagnose=await window.kaia.diagnoseMedia();
      const readerVisible=!document.getElementById('reader-panel').hidden&&getComputedStyle(document.getElementById('feed')).display==='none';
      document.getElementById('tab-sr').click();
      const srVisible=!!document.querySelector('[data-sr=save_playlist]')&&!!document.querySelector('[data-sr=restore_playlist]')&&!document.getElementById('sr-panel').hidden&&!!document.getElementById('spotify-client-id')&&document.getElementById('spotify-redirect').value.includes('127.0.0.1');
      const toggle=document.getElementById('spotify-enabled');
      const initiallyOff=toggle&&!toggle.checked;
      toggle.click();
      await new Promise(resolve=>setTimeout(resolve,100));
      const enabled=(await window.kaia.spotifyAction('info')).enabled===true;
      toggle.click();
      await new Promise(resolve=>setTimeout(resolve,100));
      const disabled=(await window.kaia.spotifyAction('info')).enabled===false&&!toggle.checked;
      const spotifyToggle=initiallyOff&&enabled&&disabled;
      await window.kaia.srAction('set_volume',[42]);
      document.getElementById('tab-chat').click();
      return {saved:saved.every===3&&saved.high.length===1&&saved.high[0]==='vip',readerVisible,srVisible:srVisible&&spotifyToggle,spotifyToggle,outputs:diagnose.outputs.length,runtime:diagnose.ffmpeg&&diagnose.ffplay,srUrl:data.srUrl,editorUrl:data.srEditorUrl};
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const mediaFrame = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, nodeIntegration: false },
    });
    await mediaFrame.loadURL(mediaTests.editorUrl);
    await new Promise((resolve) => setTimeout(resolve, 300));
    mediaTests.editor = await mediaFrame.webContents.executeJavaScript(
      `!!document.getElementById('save')&&!!document.getElementById('preview')`,
    );
    await screenshot(mediaFrame.webContents, 'preview-sr-editor.png');
    mediaFrame.destroy();
    await win.webContents.executeJavaScript(
      `document.getElementById('tab-reader').click()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    await screenshot(win.webContents, 'preview-reader.png');
    await win.webContents.executeJavaScript(
      `document.getElementById('tab-sr').click()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    await screenshot(win.webContents, 'preview-sr.png');
    const playerTests = {};
    await win.webContents.executeJavaScript(
      `document.getElementById('tab-chat').click()`,
    );
    emit('sr-state', {
      titulo: 'Música de teste',
      elapsed: 30,
      dur: 120,
      tocando: true,
      paused: false,
      repeat: 'off',
      estado: 'playing',
      fila: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    Object.assign(
      playerTests,
      await win.webContents.executeJavaScript(
        `({timeline:document.getElementById('chat-sr-timeline').max==='120'&&Number(document.getElementById('chat-sr-timeline').value)>=30,pause:document.getElementById('chat-sr-play').getAttribute('aria-label')==='Pausar música',icons:document.querySelectorAll('.mini-player-buttons svg').length===4})`,
      ),
    );
    await screenshot(win.webContents, 'preview-chat-player.png');
    emit('sr-state', {
      titulo: '',
      elapsed: 0,
      dur: 0,
      tocando: false,
      paused: false,
      repeat: 'off',
      estado: 'error',
      erro: 'YouTube exige login para o áudio',
      fila: [{ titulo: 'Pedido com erro', dur: 244, status: 'erro' }],
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    playerTests.error = await win.webContents.executeJavaScript(
      `document.getElementById('chat-sr-timeline').disabled&&document.getElementById('chat-sr-status').textContent.includes('login')&&document.getElementById('chat-sr-title').textContent==='Pedido com erro'`,
    );
    playerTests.readerActivation = await win.webContents
      .executeJavaScript(`(async()=>{
      document.getElementById('tab-reader').click();
      const box=document.getElementById('reader-enabled'),output=document.getElementById('reader-output');output.value='';box.checked=true;await box.onchange();const gated=!box.checked&&document.getElementById('reader-status').textContent.includes('escolha');
      output.add(new Option('Saída de teste','fixture-output'));output.value='fixture-output';box.checked=true;await box.onchange();const enabled=(await window.kaia.load()).reader.enabled;box.checked=false;await box.onchange();return gated&&enabled&&!(await window.kaia.load()).reader.enabled;
    })()`);
    const playerPassed =
      playerTests.timeline &&
      playerTests.pause &&
      playerTests.icons &&
      playerTests.error &&
      playerTests.readerActivation;
    const mediaPassed =
      mediaTests.saved &&
      mediaTests.readerVisible &&
      mediaTests.srVisible &&
      mediaTests.outputs > 0 &&
      mediaTests.runtime &&
      mediaTests.editor;
    await transcript.flush();
    const backup = fs.readFileSync(
      JSON.parse(fs.readFileSync(config(), 'utf8')).transcriptPath,
      'utf8',
    );
    const backupPassed =
      backup.includes('Esta mensagem deve ser bloqueada') &&
      backup.includes('Mensagem com tempo individual');
    const v10 = {};
    emit('sr-state', {
      titulo: 'Faixa atual',
      user: 'PessoaTeste',
      dur: 120,
      elapsed: 10,
      tocando: true,
      paused: false,
      estado: 'playing',
      repeat: 'off',
      fila: [
        {
          key: 'r1',
          titulo: 'Pedido A',
          user: 'PessoaA',
          fonte: 'sr',
          status: 'ok',
        },
        {
          key: 'p1',
          titulo: 'Fundo B',
          user: 'Operador',
          fonte: 'playlist',
          status: 'ok',
        },
      ],
      request_count: 1,
      playlist_count: 1,
    });
    await new Promise((r) => setTimeout(r, 80));
    v10.queues = await win.webContents.executeJavaScript(
      `document.getElementById('sr-queue').children.length===1&&document.getElementById('sr-background-queue').children.length===1&&document.getElementById('sr-request-count').textContent==='1'&&document.getElementById('sr-playlist-count').textContent==='1'&&document.getElementById('chat-sr-requester').textContent.includes('PessoaTeste')`,
    );
    v10.drag = await win.webContents.executeJavaScript(
      `getComputedStyle(document.querySelector('.window-drag-strip')).getPropertyValue('-webkit-app-region')==='drag'`,
    );
    const { SRShortcuts } = require('./sr-shortcuts');
    const { globalShortcut } = require('electron');
    const shortcutProbe = new SRShortcuts(globalShortcut, () => {});
    try {
      shortcutProbe.configure({ play_pause: 'Ctrl+Alt+Shift+F12' });
      v10.shortcut = globalShortcut.isRegistered('Ctrl+Alt+Shift+F12');
    } finally {
      shortcutProbe.clear();
    }
    fs.writeFileSync(
      path.join(app.getPath('userData'), 'media/avatar/sr.json'),
      JSON.stringify({
        titulo: 'SR privado',
        user: 'PessoaPrivada',
        fila: [{ user: 'PessoaFila', titulo: 'Pedido' }],
      }),
    );
    const publicSR = await (
      await fetch(mediaTests.srUrl.replace('sr.html', 'sr.json'))
    ).json();
    v10.hudPrivate =
      !('user' in publicSR) &&
      (publicSR.fila || []).every((item) => !('user' in item));
    const { AlertSources } = require('./alerts');
    const http = require('node:http');
    const alertEvents = [];
    const alertServer = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<div id="alert-message">Antigo</div><iframe id="frame" srcdoc="<div id=alert-message></div>"></iframe><script>let n=0;const animate=()=>{document.getElementById("alert-message").style.transform="translateX("+(n++%2)+"px)";if(n<400)requestAnimationFrame(animate);};animate();setTimeout(()=>document.getElementById("alert-message").textContent="TestePessoa seguiu o canal",900);setTimeout(()=>document.getElementById("alert-message").textContent="",1400);setTimeout(()=>document.getElementById("frame").contentDocument.getElementById("alert-message").textContent="TesteSub se inscreveu",2100);setTimeout(()=>document.getElementById("frame").contentDocument.getElementById("alert-message").textContent="",2700);</script>',
      );
    });
    await new Promise((r) => alertServer.listen(0, '127.0.0.1', r));
    const alertProbe = new AlertSources({
      event: (v) => alertEvents.push(v),
      status: () => {},
    });
    try {
      alertProbe.configure([
        {
          name: 'Fonte de teste',
          provider: 'custom',
          selector: '#alert-message',
          url: 'http://127.0.0.1:' + alertServer.address().port + '/widget',
        },
      ]);
      const deadline = Date.now() + 8000;
      while (alertEvents.length < 2 && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 100));
      v10.alerts =
        alertEvents.length === 2 &&
        alertEvents[0].text.includes('seguiu') &&
        alertEvents[1].text.includes('inscreveu') &&
        Array.from(alertProbe.windows.values()).every((x) =>
          x.window.webContents.isAudioMuted(),
        );
    } finally {
      alertProbe.close();
      await new Promise((r) => alertServer.close(r));
    }
    emit('alert-state', {
      source: 'Fonte de teste',
      text: 'TestePessoa seguiu o canal',
      at: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 50));
    v10.lastAlert = await win.webContents.executeJavaScript(
      `document.getElementById('last-alert').textContent.includes('seguiu')&&document.getElementById('chat-last-alert').textContent.includes('seguiu')`,
    );
    const playlistSizing = await win.webContents.executeJavaScript(`(async()=>{
      const data=await window.kaia.load();
      const large=await window.kaia.saveSR({...data.sr,playlistLimit:9999});
      const all=await window.kaia.saveSR({...data.sr,playlistLimit:0});
      const field=document.getElementById('sr-playlistLimit');
      return large.playlistLimit===9999&&all.playlistLimit===0&&!field.hasAttribute('max');
    })()`);
    const volumeLive = await win.webContents.executeJavaScript(`(async()=>{
      const field=document.getElementById('sr-volume');
      if(field.type!=='range')return false;
      field.value='31';field.dispatchEvent(new Event('input',{bubbles:true}));
      const deadline=Date.now()+6000;
      while(Date.now()<deadline){
        const saved=await window.kaia.load();
        if(saved.sr.volume===31){field.value='80';field.dispatchEvent(new Event('input',{bubbles:true}));return true;}
        await new Promise(r=>setTimeout(r,50));
      }
      return false;
    })()`);
    if(!volumeLive)throw Error('SR volume slider did not apply on input');
    emit('sr-state', {
      fila: Array.from({ length: 9999 }, (_, i) => ({
        key: 'large-' + i,
        titulo: 'Track ' + i,
        fonte: 'playlist',
        status: 'fila',
      })),
      playlist_count: 9999,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const playlistPaging = await win.webContents.executeJavaScript(`(()=>{
      const list=document.getElementById('sr-background-queue');
      const bounded=list.children.length===101;
      list.firstElementChild.querySelectorAll('button')[1].click();
      return bounded&&list.children.length===101&&list.children[1].textContent.startsWith('101.')&&list.children[1].querySelector('input').max==='9999';
    })()`);
    emit('sr-state', { diagnostics: {sequence: 1, events: [{at: Date.now()/1000, event:'pulada', title:'Faixa de teste', reason:'Private video', position:7}]} });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const srDiagnostics = await win.webContents.executeJavaScript(`document.getElementById('sr-diagnostics').textContent.includes('Private video')&&document.getElementById('sr-background-queue').children.length===101&&!!document.getElementById('sr-export-log')`);
    if (!srDiagnostics) throw Error('SR diagnostics or partial queue update failed');
    emit('sr-state', { fila: [], playlist_count: 0 });
    const localeTests = await win.webContents.executeJavaScript(`(async()=>{
      const preserved=document.createElement('div');preserved.className='message';preserved.textContent='Salvar e conectar';document.getElementById('feed').append(preserved);
      const rows=[];const voices=await window.kaia.voices();const before=document.getElementById('twitch-channel').value;
      for(const language of window.KaiaI18n.languages){
        document.querySelector('#language-toggle').click();
        Array.from(document.querySelectorAll('#language-picker button')).find(b=>b.lang===language.code).click();
        const deadline=Date.now()+5000;
        while((document.documentElement.lang!==language.code||document.getElementById('reader-voice-language').value!==language.code)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,30));
        const state=await window.kaia.load(),voice=voices.find(v=>v.id===state.reader.voice);
        const actual=document.getElementById('reader-voice').value;
        rows.push({language:language.code,translated:document.getElementById('tab-reader').textContent===window.KaiaI18n.translate('Leitor',language.code),direction:document.documentElement.dir===language.dir,voice:!!voice&&voice.locale.split('-')[0]===language.code.split('-')[0]&&actual===voice.id,preserved:preserved.textContent==='Salvar e conectar'&&document.getElementById('twitch-channel').value===before,flag:document.querySelector('#language-toggle img').complete});
      }
      preserved.remove();return {rows,voiceCount:voices.length,passed:rows.every(r=>r.translated&&r.direction&&r.voice&&r.preserved&&r.flag)};
    })()`);
    localeTests.persisted =
      JSON.parse(
        fs.readFileSync(
          path.join(app.getPath('userData'), 'settings.json'),
          'utf8',
        ),
      ).language === 'zh-CN';
    for (const language of ['en', 'ja', 'ar']) {
      await win.webContents.executeJavaScript(
        `window.kaia.saveLanguage(${JSON.stringify(language)}).then(()=>document.getElementById('tab-reader').click())`,
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      await screenshot(
        win.webContents,
        'preview-language-' + language + '.png',
      );
    }
    const result = {
      passed:
        playlistSizing &&
        playlistPaging &&
        localeTests.passed &&
        localeTests.persisted &&
        Object.values(v10).every(Boolean) &&
        passed &&
        overlayPassed &&
        blockingPassed &&
        timingPassed &&
        backupPassed &&
        widgetPassed &&
        windowPassed &&
        mediaPassed &&
        playerPassed &&
        customSaved,
      initial,
      changed,
      restored,
      transparent,
      alpha,
      visualCapture: !domOnly,
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
      controls,
      windowTests,
      mediaTests,
      playerTests,
      v10,
      localeTests,
      playlistSizing,
      playlistPaging,
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
