; Автоматическое закрытие Hermes Launcher и фоновых процессов Hermes Agent при установке.
;
; Причина: приложение при закрытии окна сворачивается в трей и продолжает работать,
; а Hermes Agent запускает фоновые gateway-процессы (python.exe -m hermes_cli …,
; node.exe … openclaw в %LOCALAPPDATA%\hermes), которые переживают выход лаунчера
; и держат файлы. Штатная проверка electron-builder (CHECK_APP_RUNNING) в этом
; случае показывала диалог «Не удалось закрыть Hermes Launcher».
;
; customInit срабатывает при старте мастера (.onInit) — ранняя попытка.
; customCheckAppRunning заменяет штатную проверку перед копированием файлов:
; вместо диалога процессы завершаются принудительно.
; Фильтр строго по признакам Hermes — чужие python.exe/node.exe не затрагиваются.

!macro _hermesKillProcesses
  ; Сам лаунчер со всеми дочерними процессами Electron (включая скрытые, без окна).
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  ; Фоновые процессы агента: exe в каталоге *\hermes\* или hermes_cli/openclaw
  ; в командной строке. Чужие python.exe/node.exe пользователя не совпадают с фильтром.
  nsExec::Exec `"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($$_.ExecutablePath -and ($$_.ExecutablePath -like '*\hermes\*')) -or ($$_.CommandLine -and ($$_.CommandLine -match 'hermes_cli|openclaw')) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
!macroend

!macro customInit
  !insertmacro _hermesKillProcesses
  Sleep 1000
!macroend

!macro customCheckAppRunning
  ; До трёх попыток: завершаем процессы и ждём, пока лаунчер исчезнет из списка задач.
  StrCpy $R6 0
  kill_loop:
    !insertmacro _hermesKillProcesses
    Sleep 1000
    nsExec::Exec `"$SYSDIR\cmd.exe" /S /C ""$SYSDIR\tasklist.exe" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\"""`
    Pop $R7
    ${if} $R7 == 1
      Goto kill_done
    ${endIf}
    IntOp $R6 $R6 + 1
    ${if} $R6 > 3
      Goto kill_done
    ${endIf}
    Goto kill_loop
  kill_done:
!macroend
