!include LogicLib.nsh
!include FileFunc.nsh

; Present only after an NSIS install, never in a portable or win-unpacked build.
!macro customInstall
  FileOpen $R0 "$INSTDIR\resources\clippress-installed" w
  FileWrite $R0 "nsis"
  FileClose $R0
!macroend

!macro clippressTwoDigits VAR
  StrLen $R7 ${VAR}
  ${if} $R7 < 2
    StrCpy ${VAR} "0${VAR}"
  ${endif}
!macroend

; A settings file next to an installed executable, which the app moves to its app-data folder when
; it starts (src/main/installFolderConfig.ts). Installing an update or reinstalling first deletes
; the installation folder, so if the app has not moved it yet (or could not), the file is copied to
; where the app's next start finishes importing it. Without that copy, nothing is installed.
!macro customInit
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $R7
  Push $R8
  Push $R9
  ; The folder the earlier installation's uninstaller deletes.
  ReadRegStr $R9 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $R9 == ""
    StrCpy $R9 "$INSTDIR"
  ${endif}
  ${if} ${FileExists} "$R9\config.json"
    ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
    ; Two digits each, so that the name sorts by time like the app's own copies. (As text: NSIS
    ; reads a number such as 09 as octal.)
    !insertmacro clippressTwoDigits $0
    !insertmacro clippressTwoDigits $1
    !insertmacro clippressTwoDigits $4
    !insertmacro clippressTwoDigits $5
    !insertmacro clippressTwoDigits $6
    StrCpy $R8 "$APPDATA\${PRODUCT_NAME}\config.json.importing-$2-$1-$0T$4-$5-$6-installer"
    CreateDirectory "$APPDATA\${PRODUCT_NAME}"
    System::Call 'kernel32::CopyFileW(w "$R9\config.json", w "$R8", i 1) i .r0'
    ${ifNot} ${FileExists} "$R8"
      MessageBox MB_OK|MB_ICONSTOP "ClipPress was not installed, because the settings file in its installation folder ($R9\config.json) could not be copied to $APPDATA\${PRODUCT_NAME}, and installing deletes that folder." /SD IDOK
      Abort
    ${endif}
  ${endif}
  Pop $R9
  Pop $R8
  Pop $R7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
