const fs = require('node:fs/promises');
const path = require('node:path');
const audio = /\.(?:mp3|wav|m4a|aac|ogg|opus|flac|webm|mp4|pcm|raw|part)$/i;

// Only application-owned temporary audio folders. Never follow symlinks or
// touch selected alert files, transcripts, credentials or track metadata.
async function cleanupMedia(directory) {
  const failed = [];
  async function visit(folder) {
    let entries;
    try {
      entries = await fs.readdir(folder, { withFileTypes: true });
    } catch (error) {
      if (error.code !== 'ENOENT') failed.push(folder);
      return;
    }
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && audio.test(entry.name)) {
        try {
          await fs.unlink(file);
        } catch {
          failed.push(file);
        }
      }
    }
  }
  for (const folder of ['tmp_sr', 'tmp_audio', 'tmp_leitura'])
    await visit(path.join(directory, folder));
  return failed;
}
module.exports = { cleanupMedia };
