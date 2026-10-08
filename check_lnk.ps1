$ws = New-Object -ComObject WScript.Shell
$l = $ws.CreateShortcut('C:\Users\User\Desktop\Hermes Launcher.lnk')
Write-Host ('Target : ' + $l.TargetPath)
Write-Host ('Icon   : ' + $l.IconLocation)
Write-Host ('WorkDir: ' + $l.WorkingDirectory)
$test = Test-Path 'C:\Users\User\Desktop\hermes-launcher\hermes.ico'
Write-Host ('ico file exists: ' + $test)
