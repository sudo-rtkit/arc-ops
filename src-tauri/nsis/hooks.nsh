; ARC Raiders Companion installer hooks (0.8.0), bundle.windows.nsis.installerHooks in tauri.conf.json.
; Kept ASCII on purpose (NSIS may read an included file without BOM as ANSI); texts live in Czech.nsh / English.nsh.
; Why: launching the app right after install takes focus from ARC Raiders running in exclusive fullscreen
; (the game may minimise or crash). So the "Run ARC Raiders Companion" checkbox on the finish page is
; unchecked by default and the page advises installing with the game closed or in borderless mode.
; MUI_FINISHPAGE_* defines apply to the next MUI_PAGE_FINISH (the installer finish page); MUI then undefines them.
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!define MUI_FINISHPAGE_TEXT "$(gameHint)"

; 0.10.2: updating over an existing installation. Tauri's reinstall page pre-selects "Uninstall before installing" when
; an older version is installed, which runs the old uninstaller wizard first (the user has to click through it and could
; tick "Delete the application data"). For an upgrade we pre-select the second option instead, "install over the existing
; installation": the files in the same folder are replaced in place, shortcuts are updated (not duplicated), the registry
; entry gets the new version and %APPDATA%\cz.arcops.companion is never touched. Same version (add/reinstall in place) and
; downgrade keep Tauri's defaults. Silent, passive and /UPDATE runs never show the page and always install in place.
; The function itself is in English.nsh: that file is included after Tauri declares $ReinstallPageCheck, this one before.
!define MUI_CUSTOMFUNCTION_GUIINIT ArcPreferInPlaceUpdate
