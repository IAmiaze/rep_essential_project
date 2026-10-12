Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d ""F:\AzureProjectTrackingHtml\AzureTrackingHtml"" && python -m http.server 8090 --bind 0.0.0.0", 0, False