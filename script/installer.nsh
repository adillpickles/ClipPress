!include LogicLib.nsh
!include FileFunc.nsh
!include TextFunc.nsh

; ClipPress is offered in Explorer's "Open with" for the video and sound files it's for, under file classes of its own,
; and never takes a file type's default app. (Before Beta 6.1 the installer made it the default app for 80 types under
; the shared class names "Video" and "Audio", and uninstalling left those types pointing at nothing.)
!macro clippressRegisterClass CLASS NAME
  WriteRegStr SHELL_CONTEXT "Software\Classes\${CLASS}" "" "${NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${CLASS}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${CLASS}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro clippressOfferFileTypes
  WriteRegNone SHELL_CONTEXT "Software\Classes\.mp4\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.m4v\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.mov\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.mkv\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.webm\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.avi\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.wmv\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.flv\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.ts\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.m2ts\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.mts\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.mpg\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.mpeg\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.3gp\OpenWithProgids" "ClipPress.Video"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.mp3\OpenWithProgids" "ClipPress.Audio"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.m4a\OpenWithProgids" "ClipPress.Audio"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.wav\OpenWithProgids" "ClipPress.Audio"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.flac\OpenWithProgids" "ClipPress.Audio"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.ogg\OpenWithProgids" "ClipPress.Audio"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.opus\OpenWithProgids" "ClipPress.Audio"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.aac\OpenWithProgids" "ClipPress.Audio"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.wma\OpenWithProgids" "ClipPress.Audio"
!macroend

!macro clippressWithdrawFileTypes
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.mp4\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.m4v\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.mov\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.mkv\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.webm\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.avi\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.wmv\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.flv\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.ts\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.m2ts\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.mts\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.mpg\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.mpeg\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.3gp\OpenWithProgids" "ClipPress.Video"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.mp3\OpenWithProgids" "ClipPress.Audio"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.m4a\OpenWithProgids" "ClipPress.Audio"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.wav\OpenWithProgids" "ClipPress.Audio"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.flac\OpenWithProgids" "ClipPress.Audio"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.ogg\OpenWithProgids" "ClipPress.Audio"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.opus\OpenWithProgids" "ClipPress.Audio"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.aac\OpenWithProgids" "ClipPress.Audio"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.wma\OpenWithProgids" "ClipPress.Audio"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\ClipPress.Video"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\ClipPress.Audio"
!macroend

; A type an older ClipPress made its default, whose class its uninstaller has since removed (an update runs it first):
; the dangling default goes too, so the type opens with what Windows had before. Kept if the class is still in use.
!macro clippressForgetOldDefault EXT
  ReadRegStr $R1 SHELL_CONTEXT "Software\Classes\.${EXT}" ""
  ${If} $R1 == "Video"
  ${OrIf} $R1 == "Audio"
    ClearErrors
    ; Through the merged view Windows itself resolves (a per-machine app may own the class).
    ReadRegStr $R2 HKCR "$R1\shell\open\command" ""
    ${If} ${Errors}
      DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}" ""
    ${EndIf}
  ${EndIf}
!macroend

!macro clippressForgetOldDefaults
  Push $R1
  Push $R2
  !insertmacro clippressForgetOldDefault "webm"
  !insertmacro clippressForgetOldDefault "mkv"
  !insertmacro clippressForgetOldDefault "flv"
  !insertmacro clippressForgetOldDefault "vob"
  !insertmacro clippressForgetOldDefault "ogv"
  !insertmacro clippressForgetOldDefault "drc"
  !insertmacro clippressForgetOldDefault "gif"
  !insertmacro clippressForgetOldDefault "gifv"
  !insertmacro clippressForgetOldDefault "mng"
  !insertmacro clippressForgetOldDefault "avi"
  !insertmacro clippressForgetOldDefault "mts"
  !insertmacro clippressForgetOldDefault "m2ts"
  !insertmacro clippressForgetOldDefault "ts"
  !insertmacro clippressForgetOldDefault "mov"
  !insertmacro clippressForgetOldDefault "qt"
  !insertmacro clippressForgetOldDefault "wmv"
  !insertmacro clippressForgetOldDefault "yuv"
  !insertmacro clippressForgetOldDefault "rm"
  !insertmacro clippressForgetOldDefault "rmvb"
  !insertmacro clippressForgetOldDefault "asf"
  !insertmacro clippressForgetOldDefault "amv"
  !insertmacro clippressForgetOldDefault "mp4"
  !insertmacro clippressForgetOldDefault "m4v"
  !insertmacro clippressForgetOldDefault "mpg"
  !insertmacro clippressForgetOldDefault "mp2"
  !insertmacro clippressForgetOldDefault "mpeg"
  !insertmacro clippressForgetOldDefault "mpe"
  !insertmacro clippressForgetOldDefault "mpv"
  !insertmacro clippressForgetOldDefault "m2v"
  !insertmacro clippressForgetOldDefault "svi"
  !insertmacro clippressForgetOldDefault "3gp"
  !insertmacro clippressForgetOldDefault "3g2"
  !insertmacro clippressForgetOldDefault "mxf"
  !insertmacro clippressForgetOldDefault "roq"
  !insertmacro clippressForgetOldDefault "nsv"
  !insertmacro clippressForgetOldDefault "f4v"
  !insertmacro clippressForgetOldDefault "f4p"
  !insertmacro clippressForgetOldDefault "f4a"
  !insertmacro clippressForgetOldDefault "f4b"
  !insertmacro clippressForgetOldDefault "aa"
  !insertmacro clippressForgetOldDefault "aac"
  !insertmacro clippressForgetOldDefault "aax"
  !insertmacro clippressForgetOldDefault "act"
  !insertmacro clippressForgetOldDefault "aiff"
  !insertmacro clippressForgetOldDefault "alac"
  !insertmacro clippressForgetOldDefault "amr"
  !insertmacro clippressForgetOldDefault "ape"
  !insertmacro clippressForgetOldDefault "au"
  !insertmacro clippressForgetOldDefault "awb"
  !insertmacro clippressForgetOldDefault "dct"
  !insertmacro clippressForgetOldDefault "dss"
  !insertmacro clippressForgetOldDefault "dvf"
  !insertmacro clippressForgetOldDefault "flac"
  !insertmacro clippressForgetOldDefault "gsm"
  !insertmacro clippressForgetOldDefault "iklax"
  !insertmacro clippressForgetOldDefault "ivs"
  !insertmacro clippressForgetOldDefault "m4a"
  !insertmacro clippressForgetOldDefault "m4b"
  !insertmacro clippressForgetOldDefault "m4p"
  !insertmacro clippressForgetOldDefault "mmf"
  !insertmacro clippressForgetOldDefault "mp3"
  !insertmacro clippressForgetOldDefault "mpc"
  !insertmacro clippressForgetOldDefault "msv"
  !insertmacro clippressForgetOldDefault "nmf"
  !insertmacro clippressForgetOldDefault "nsf"
  !insertmacro clippressForgetOldDefault "ogg"
  !insertmacro clippressForgetOldDefault "oga"
  !insertmacro clippressForgetOldDefault "mogg"
  !insertmacro clippressForgetOldDefault "opus"
  !insertmacro clippressForgetOldDefault "ra"
  !insertmacro clippressForgetOldDefault "rf64"
  !insertmacro clippressForgetOldDefault "sln"
  !insertmacro clippressForgetOldDefault "tta"
  !insertmacro clippressForgetOldDefault "voc"
  !insertmacro clippressForgetOldDefault "vox"
  !insertmacro clippressForgetOldDefault "wav"
  !insertmacro clippressForgetOldDefault "wma"
  !insertmacro clippressForgetOldDefault "wv"
  !insertmacro clippressForgetOldDefault "8svx"
  !insertmacro clippressForgetOldDefault "cda"
  Pop $R2
  Pop $R1
!macroend

!macro customInstall
  ; Present only after an NSIS install, never in a portable or win-unpacked build.
  FileOpen $R0 "$INSTDIR\resources\clippress-installed" w
  FileWrite $R0 "nsis"
  FileClose $R0

  !insertmacro clippressForgetOldDefaults
  !insertmacro clippressRegisterClass "ClipPress.Video" "Video"
  !insertmacro clippressRegisterClass "ClipPress.Audio" "Audio"
  !insertmacro clippressOfferFileTypes
  ; Explorer reads the file types again.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  ; Not for an update: if it fails, the installation it leaves must still open files; one that works registers them again.
  ${ifNot} ${isUpdated}
    !insertmacro clippressWithdrawFileTypes
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${endIf}
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
