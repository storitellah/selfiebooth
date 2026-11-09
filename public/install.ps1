# Selfie Studio installer for Windows.
#
#   irm https://selfiebooth.pages.dev/install.ps1 | iex
#
# Installs into "%USERPROFILE%\Selfie Studio", adds a "Selfie Studio"
# shortcut to the Desktop and starts the booth. No admin rights needed.
$ErrorActionPreference = 'Stop'
$branch = 'claude/exciting-maxwell-oq0a84'
$dest = Join-Path $env:USERPROFILE 'Selfie Studio'
$tmp = Join-Path $env:TEMP ("selfie-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null

Write-Host ''
Write-Host '  Installing Selfie Studio by Storitellah'
Write-Host '  Downloading the latest version...'
$zip = Join-Path $tmp 'app.zip'
Invoke-WebRequest "https://codeload.github.com/storitellah/selfiebooth/zip/refs/heads/$branch" -OutFile $zip
Expand-Archive $zip -DestinationPath $tmp -Force
$src = (Get-ChildItem $tmp -Directory)[0].FullName

New-Item -ItemType Directory -Path $dest -Force | Out-Null
# Replace the app files but keep the saved printer (config.json) and Node.js (.node).
Get-ChildItem $src -Force | ForEach-Object {
  $target = Join-Path $dest $_.Name
  if (Test-Path $target) { Remove-Item $target -Recurse -Force }
  Copy-Item $_.FullName $target -Recurse -Force
}
Remove-Item $tmp -Recurse -Force
Write-Host "  Installed in: $dest"

$bat = Join-Path $dest 'Start Selfie Studio (Windows).bat'
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Selfie Studio.lnk'
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($lnk)
$s.TargetPath = $bat
$s.WorkingDirectory = $dest
$s.Save()
Write-Host '  Shortcut added: Desktop -> Selfie Studio'
Write-Host '  Starting the booth...'
Start-Process $bat -WorkingDirectory $dest
