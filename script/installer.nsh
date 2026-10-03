; Present only after an NSIS install, never in a portable or win-unpacked build.
!macro customInstall
  FileOpen $R0 "$INSTDIR\resources\clippress-installed" w
  FileWrite $R0 "nsis"
  FileClose $R0
!macroend
