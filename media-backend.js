const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const { cleanupMedia } = require('./media-cleanup');
class MediaBackend {
  constructor(data, status = () => {}) {
    this.data = data;
    this.status = status;
    this.pending = new Map();
    this.sequence = 0;
  }
  start() {
    if (this.ready) return this.ready;
    this.ready = cleanupMedia(this.data).then(
      () =>
        new Promise((resolve, reject) => {
          const runtime = path.join(__dirname, '.runtime');
          const python = path.join(runtime, 'python', 'python.exe');
          if (!fs.existsSync(python)) {
            this.ready = null;
            reject(
              Error(
                'Runtime de áudio ausente. Use o ZIP completo ou prepare .runtime.',
              ),
            );
            return;
          }
          this.process = spawn(
            python,
            ['-u', path.join(__dirname, 'backend', 'bridge.py')],
            {
              windowsHide: true,
              cwd: __dirname,
              env: {
                ...process.env,
                KAIA_MEDIA_DATA: this.data,
                PYTHONIOENCODING: 'utf-8',
                PYTHONDONTWRITEBYTECODE: '1',
                PATH:
                  path.join(runtime, 'ffmpeg') +
                  path.delimiter +
                  path.dirname(process.execPath) +
                  path.delimiter +
                  process.env.PATH,
              },
            },
          );
          const timeout = setTimeout(
            () => reject(Error('O motor de áudio demorou para iniciar.')),
            20000,
          );
          readline
            .createInterface({ input: this.process.stdout })
            .on('line', (line) => {
              try {
                const packet = JSON.parse(line);
                if (packet.event === 'ready') {
                  clearTimeout(timeout);
                  resolve();
                  return;
                }
                const pending = this.pending.get(packet.id);
                if (!pending) return;
                this.pending.delete(packet.id);
                clearTimeout(pending.timer);
                if (packet.error) pending.reject(Error(packet.error));
                else pending.resolve(packet.result);
              } catch {}
            });
          this.process.stderr.on('data', () => {}); // Never log cookies, credentials or chat text.
          this.process.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
          this.process.on('exit', () => {
            clearTimeout(timeout);
            this.ready = null;
            reject(Error('Motor de áudio encerrado.'));
            for (const pending of this.pending.values()) {
              clearTimeout(pending.timer);
              pending.reject(Error('Motor de áudio encerrado.'));
            }
            this.pending.clear();
          });
        }),
    );
    return this.ready;
  }
  async call(action, args = [], timeout = 120000) {
    await this.start();
    return new Promise((resolve, reject) => {
      const id = ++this.sequence,
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(Error('A operação de áudio excedeu o tempo.'));
        }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(JSON.stringify({ id, action, args }) + '\n');
    });
  }
  async close() {
    if (!this.process) return;
    try {
      await this.call('shutdown', [], 5000);
    } catch {}
    const child = this.process;
    if (child && child.exitCode === null) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill();
      });
    }
  }
}
module.exports = { MediaBackend };
