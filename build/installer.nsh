; Автоматическое закрытие работающего экземпляра Hermes Launcher при установке.
;
; Причина: приложение при закрытии окна сворачивается в трей и продолжает работать,
; поэтому штатная проверка electron-builder (CHECK_APP_RUNNING) не могла его закрыть
; и показывала диалог «Не удалось закрыть Hermes Launcher».
;
; customInit срабатывает при старте мастера (.onInit) — ранняя попытка.
; customCheckAppRunning заменяет штатную проверку перед копированием файлов —
; вместо диалога приложение завершается принудительно.

!macro customInit
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /IM "${APP_EXECUTABLE_FILENAME}"`
  Sleep 1000
!macroend

!macro customCheckAppRunning
  ; До трёх попыток: завершаем процесс и ждём, пока он исчезнет из списка задач.
  StrCpy $R6 0
  kill_loop:
    nsExec::Exec `"$SYSDIR\taskkill.exe" /F /IM "${APP_EXECUTABLE_FILENAME}"`
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
