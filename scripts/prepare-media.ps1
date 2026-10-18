$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot '.runtime'
$pythonRoot = Join-Path $runtimeRoot 'python'
$toolsRoot = Join-Path $runtimeRoot 'ffmpeg'
New-Item -ItemType Directory -Path $pythonRoot,$toolsRoot -Force | Out-Null
$downloadPath = Join-Path $runtimeRoot 'python-3.14.7-embed-amd64.zip'
Invoke-WebRequest 'https://www.python.org/ftp/python/3.14.7/python-3.14.7-embed-amd64.zip' -OutFile $downloadPath
if ((Get-FileHash $downloadPath -Algorithm SHA256).Hash.ToLower() -ne 'd297e5ff019966817ad8502465176139f2d3d840fa4ed84b13bed399a6ab1f15') { throw 'Python: SHA-256 incorreto.' }
Expand-Archive -LiteralPath $downloadPath -DestinationPath $pythonRoot -Force
@'
python314.zip
.
Lib/site-packages
import site
'@ | Set-Content (Join-Path $pythonRoot 'python314._pth') -Encoding ascii
py -3.14 -m pip install --target (Join-Path $pythonRoot 'Lib/site-packages') -r (Join-Path $projectRoot 'backend/requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Instalação das dependências falhou.' }
Copy-Item -LiteralPath (Join-Path $pythonRoot 'python.exe') -Destination (Join-Path $pythonRoot 'kaia_leitura.exe')
Copy-Item -LiteralPath (Join-Path $pythonRoot 'python.exe') -Destination (Join-Path $pythonRoot 'kaia_tts.exe')
foreach ($tool in @('ffmpeg','ffplay','node')) { Copy-Item -LiteralPath (Get-Command $tool -ErrorAction Stop).Source -Destination (Join-Path $toolsRoot ($tool+'.exe')) }
Write-Output 'Motor preparado. Inclua as licenças e os metadados da distribuição FFmpeg/Node utilizada antes de redistribuir.'
