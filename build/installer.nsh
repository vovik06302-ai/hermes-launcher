; Автоматическое закрытие работающего экземпляра Hermes Launcher перед установкой.
; Без этого assisted-установщик показывает диалог «Не удалось закрыть Hermes Launcher»,
; потому что приложение при закрытии окна остаётся жить в трее.
!macro customInit
  nsProcess::FindProcess "Hermes Launcher.exe" $R0
  ${If} $R0 == 0
    nsProcess::KillProcess "Hermes Launcher.exe" $R0
    ; Даём процессу время полностью завершиться и освободить файлы
    Sleep 2000
  ${EndIf}
!macroend
