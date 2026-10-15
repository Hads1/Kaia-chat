const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  pkg = require('../package.json');
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw Error('Gere esta distribuição em Windows x64.');
const name = `KaiaChat-${pkg.version}-Windows-x64`,
  dist = path.join(root, 'dist'),
  stage = path.join(dist, name),
  zip = stage + '.zip';
if (fs.existsSync(stage) || fs.existsSync(zip))
  throw Error(
    'A versão já foi empacotada em dist. Use uma nova versão ou mova a distribuição anterior.',
  );
fs.mkdirSync(stage, { recursive: true });
fs.cpSync(path.join(root, 'node_modules/electron/dist'), stage, {
  recursive: true,
});
fs.renameSync(
  path.join(stage, 'electron.exe'),
  path.join(stage, 'KaiaChat.exe'),
);
const appDir = path.join(stage, 'resources/app');
fs.mkdirSync(path.join(appDir, 'node_modules'), { recursive: true });
const source = [
  'main.js',
  'preload.js',
  'renderer.js',
  'services.js',
  'starvios.js',
  'protocol.js',
  'appearance.js',
  'blocking.js',
  'blocked-ui.js',
  'typography.js',
  'smoke.js',
  'live-test.js',
  'test.js',
  'index.html',
  'style.css',
  'package.json',
  'package-lock.json',
  'LICENSE',
  'CREDITOS.md',
  'README.md',
  'LEIA-ME.md',
  '.prettierrc.json',
  '.prettierignore',
  '.gitignore',
  '.gitattributes',
  'assets',
  'scripts',
];
for (const file of source)
  fs.cpSync(path.join(root, file), path.join(appDir, file), {
    recursive: true,
  });
for (const dep of Object.keys(pkg.dependencies))
  fs.cpSync(
    path.join(root, 'node_modules', dep),
    path.join(appDir, 'node_modules', dep),
    { recursive: true },
  );
for (const file of ['README.md', 'LEIA-ME.md', 'CREDITOS.md'])
  fs.copyFileSync(path.join(root, file), path.join(stage, file));
fs.copyFileSync(
  path.join(root, 'LICENSE'),
  path.join(stage, 'LICENSE-KAIA-GPLv3.txt'),
);
fs.writeFileSync(
  path.join(stage, 'COMECE-AQUI.txt'),
  `KAIA CHAT ${pkg.version} — WINDOWS 10/11 x64\r\n\r\nExtraia o ZIP inteiro e abra KaiaChat.exe.\r\nConfigure Twitch, Kick e/ou Starvios com seus próprios canais.\r\nSelecione som/volume por plataforma e clique em Salvar e conectar.\r\nFontes, cores e sombras ficam em Fonte, cor e sombra.\r\nA engrenagem ativa o modo 100% transparente, apenas mensagens.\r\nCtrl+Shift+F9 retorna às configurações e libera os cliques.\r\n\r\nSem login e somente leitura. Requer internet.\r\nCada computador salva suas próprias preferências.\r\nNão envie somente o EXE; compartilhe o ZIP completo.\r\nCódigo-fonte em resources/app. Licença GPLv3 e créditos incluídos.\r\n`,
);
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:KAIA_STAGE,$env:KAIA_ZIP,[IO.Compression.CompressionLevel]::Optimal,$true)',
  ],
  {
    env: { ...process.env, KAIA_STAGE: stage, KAIA_ZIP: zip },
    windowsHide: true,
    stdio: 'inherit',
  },
);
const hash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(zip))
  .digest('hex');
fs.writeFileSync(zip + '.sha256.txt', `${hash}  ${path.basename(zip)}\n`);
console.log(`Distribuição criada: ${zip}`);
