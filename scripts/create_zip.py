"""Portable Windows ZIP using maximum compatible DEFLATE compression."""
import sys,zipfile
from pathlib import Path
stage=Path(sys.argv[1]).resolve();output=Path(sys.argv[2]).resolve()
if not stage.is_dir() or output.exists() or output.parent!=stage.parent:
    raise ValueError('Invalid or existing distribution path')
with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9,strict_timestamps=False) as archive:
    for source in sorted(stage.rglob('*')):
        if source.is_file() and not source.is_symlink():archive.write(source,stage.name+'/'+source.relative_to(stage).as_posix())
print('ZIP DEFLATE level 9 created.')
