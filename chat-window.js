const { BaseWindow, WebContentsView } = require('electron');
// One renderer is moved between a normal Windows frame and a transparent game
// surface. Connections, audio, form state and message timers are never restarted.
function createChatWindow(options) {
  const { webPreferences, ...nativeOptions } = options;
  const main = new BaseWindow({
    ...nativeOptions,
    transparent: false,
    thickFrame: true,
    backgroundColor: '#0d1019',
  });
  const view = new WebContentsView({ webPreferences });
  view.setBackgroundColor('#00000000');
  main.contentView.addChildView(view);
  main.webContents = view.webContents;
  main.loadFile = (...args) => view.webContents.loadFile(...args);
  main.reload = () => view.webContents.reload();
  let layer = null,
    showTimer;
  const methods = [
    'show',
    'showInactive',
    'hide',
    'focus',
    'blur',
    'isVisible',
    'isFocused',
    'setFocusable',
    'isFocusable',
    'setIgnoreMouseEvents',
  ];
  const native = Object.fromEntries(
    methods.map((key) => [key, main[key].bind(main)]),
  );
  for (const key of methods)
    main[key] = (...args) =>
      layer && !layer.isDestroyed()
        ? layer[key](...args)
        : native[key](...args);
  const fit = () => {
    if (main.isDestroyed()) return;
    const host = layer && !layer.isDestroyed() ? layer : main;
    const { width, height } = host.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  main.on('resize', fit);
  main.setOverlayMode = (enabled) => {
    clearTimeout(showTimer);
    if (enabled && !layer) {
      const bounds = main.getContentBounds();
      layer = new BaseWindow({
        ...bounds,
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        focusable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        backgroundColor: '#00000000',
        hasShadow: false,
      });
      layer.setAlwaysOnTop(true, 'screen-saver');
      layer.setIgnoreMouseEvents(true, { forward: true });
      layer.on('close', (event) => {
        event.preventDefault();
        if (!main.isDestroyed()) main.close();
      });
      main.contentView.removeChildView(view);
      layer.contentView.addChildView(view);
      layer.on('resize', fit);
      fit();
      native.hide();
      showTimer = setTimeout(() => {
        if (layer && !layer.isDestroyed()) layer.showInactive();
      }, 40);
    } else if (!enabled && layer) {
      const previous = layer;
      layer = null;
      previous.contentView.removeChildView(view);
      main.contentView.addChildView(view);
      fit();
      previous.destroy();
      native.setIgnoreMouseEvents(false);
      native.setFocusable(true);
      main.setSkipTaskbar(false);
      native.show();
    }
  };
  main.getGameWindow = () => layer;
  main.on('closed', () => {
    clearTimeout(showTimer);
    if (layer && !layer.isDestroyed()) layer.destroy();
    if (!view.webContents.isDestroyed()) view.webContents.close();
  });
  fit();
  return main;
}
module.exports = { createChatWindow };
