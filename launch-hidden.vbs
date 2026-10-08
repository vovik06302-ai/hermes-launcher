Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\User\Desktop\hermes-launcher"
WshShell.Run "cmd /c npm start", 0, False