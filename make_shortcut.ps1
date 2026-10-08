$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = $ws.CreateShortcut((Join-Path $desktop 'Hermes Launcher.lnk'))
$lnk.TargetPath = 'C:\Users\User\Desktop\Hermes Launcher.bat'
$lnk.WorkingDirectory = 'C:\Users\User\Desktop\hermes-launcher'
$lnk.IconLocation = 'C:\Users\User\Desktop\hermes-launcher\hermes.ico,0'
$lnk.Description = 'Hermes Launcher - запуск Hermes Agent'
$lnk.Save()
Write-Host 'shortcut saved'
