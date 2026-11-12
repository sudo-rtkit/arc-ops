; ARC Raiders Companion installer hooks (0.8.0), bundle.windows.nsis.installerHooks in tauri.conf.json.
; Kept ASCII on purpose (NSIS may read an included file without BOM as ANSI); texts live in Czech.nsh / English.nsh.
; Why: launching the app right after install takes focus from ARC Raiders running in exclusive fullscreen
; (the game may minimise or crash). So the "Run ARC Raiders Companion" checkbox on the finish page is
; unchecked by default and the page advises installing with the game closed or in borderless mode.
; MUI_FINISHPAGE_* defines apply to the next MUI_PAGE_FINISH (the installer finish page); MUI then undefines them.
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!define MUI_FINISHPAGE_TEXT "$(gameHint)"
