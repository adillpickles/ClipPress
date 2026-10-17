!include LogicLib.nsh
!include FileFunc.nsh
!include TextFunc.nsh

; Present only after an NSIS install, never in a portable or win-unpacked build.
!macro customInstall
  FileOpen $R0 "$INSTDIR\resources\clippress-installed" w
  FileWrite $R0 "nsis"
  FileClose $R0
!macroend

!macro clippressTwoDigits VAR
  StrLen $R5 ${VAR}
  ${if} $R5 < 2
    StrCpy ${VAR} "0${VAR}"
  ${endif}
!macroend

; Stops the installation, which has not changed anything yet.
!macro clippressRefuse MESSAGE
  MessageBox MB_OK|MB_ICONSTOP "${MESSAGE}" /SD IDOK
  Abort
!macroend

; Copies the settings file FROM to TO, a name no file has yet, and makes sure that the copy is
; complete and on disk before anything deletes FROM. Otherwise installs nothing. Uses $3 to $6.
!macro clippressCopySettingsFile FROM TO
  System::Call 'kernel32::CopyFileW(w "${FROM}", w "${TO}", i 1) i .r3 ?e'
  Pop $4
  ${if} $3 == 0
    !insertmacro clippressRefuse "ClipPress was not installed, because a settings file in its installation folder (${FROM}) could not be copied to ${TO} (error $4), and installing deletes that folder."
  ${endif}
  ; As large as the original, and written to the disk rather than only to its cache.
  ClearErrors
  FileOpen $5 "${FROM}" r
  FileSeek $5 0 END $3
  FileClose $5
  FileOpen $5 "${TO}" a
  FileSeek $5 0 END $4
  System::Call 'kernel32::FlushFileBuffers(p r5) i .r6'
  FileClose $5
  ${if} ${Errors}
  ${orIf} $3 != $4
  ${orIf} $6 == 0
    !insertmacro clippressRefuse "ClipPress was not installed, because the copy of a settings file in its installation folder (${FROM}) at ${TO} could not be verified, and installing deletes that folder."
  ${endif}
!macroend

; Installing an update or reinstalling first deletes the installation folder: the earlier version's
; uninstaller deletes the folder it was installed in, settings and all. Before that:
; - A settings folder that ClipPress uses inside the installation folder (given with --config-dir)
;   is listed in clippress-settings-folders.txt there (src/main/installFolderConfig.ts). The app
;   cannot move it, so nothing is installed while one of those folders has a config.json.
; - A settings file next to the executable, which the app moves to its app-data folder when it
;   starts (src/main/installFolderConfig.ts), is copied to where the app's next start finishes
;   importing it, and the other settings files there (backups) are copied next to it.
;   Without those copies, nothing is installed.
!macro customInit
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $R5
  Push $R6
  Push $R7
  Push $R8
  Push $R9
  ; The folder the earlier installation's uninstaller deletes.
  ReadRegStr $R9 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $R9 == ""
    StrCpy $R9 "$INSTDIR"
  ${endif}
  StrCpy $R6 "$APPDATA\${PRODUCT_NAME}"

  ${if} ${FileExists} "$R9\clippress-settings-folders.txt"
    ClearErrors
    FileOpen $0 "$R9\clippress-settings-folders.txt" r
    ${if} ${Errors}
      !insertmacro clippressRefuse "ClipPress was not installed, because it keeps settings inside its installation folder ($R9), which installing deletes, and it could not read where."
    ${endif}
    ${do}
      ClearErrors
      FileReadUTF16LE $0 $1
      ${if} ${Errors}
        ${exitdo}
      ${endif}
      ${TrimNewLines} "$1" $1
      ${if} $1 != ""
      ${andIf} ${FileExists} "$1\config.json"
        FileClose $0
        !insertmacro clippressRefuse "ClipPress was not installed, because it keeps settings in $1, inside its installation folder ($R9), which installing deletes. Move that folder out of the installation folder, start ClipPress with --config-dir set to its new place, and install again."
      ${endif}
    ${loop}
    FileClose $0
  ${endif}

  ${if} ${FileExists} "$R9\config.json"
    ; UTC, like the app's own copies, and two digits each, so that the names sort by when the copies
    ; were made. (As text: NSIS reads a number such as 09 as octal.)
    ${GetTime} "" "LS" $0 $1 $2 $3 $4 $5 $6
    !insertmacro clippressTwoDigits $0
    !insertmacro clippressTwoDigits $1
    !insertmacro clippressTwoDigits $4
    !insertmacro clippressTwoDigits $5
    !insertmacro clippressTwoDigits $6
    StrCpy $R8 "$R6\config.json.importing-$2-$1-$0T$4-$5-$6-installer"
    ; A name no file has yet: a file that is already there is not this copy.
    StrCpy $R7 $R8
    StrCpy $2 1
    ${while} ${FileExists} $R7
      IntOp $2 $2 + 1
      ${if} $2 > 9
        !insertmacro clippressRefuse "ClipPress was not installed, because the settings file in its installation folder ($R9\config.json) could not be copied to $R6, and installing deletes that folder."
      ${endif}
      StrCpy $R7 "$R8-$2"
    ${endwhile}
    CreateDirectory $R6
    !insertmacro clippressCopySettingsFile "$R9\config.json" $R7
  ${endif}

  ClearErrors
  FindFirst $0 $1 "$R9\config.json.*"
  ${while} $1 != ""
    ${if} $1 != "config.json"
    ${andIfNot} ${FileExists} "$R9\$1\*.*"
    ${andIfNot} ${FileExists} "$R6\$1"
      CreateDirectory $R6
      !insertmacro clippressCopySettingsFile "$R9\$1" "$R6\$1"
    ${endif}
    FindNext $0 $1
  ${endwhile}
  FindClose $0

  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
