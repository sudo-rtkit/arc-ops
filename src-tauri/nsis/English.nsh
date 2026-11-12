; English for the NSIS installer: copy of English.nsh from tauri-bundler 2 plus gameHint (0.8.0).
; Must be UTF-8 without BOM: Tauri adds the BOM when copying.
LangString addOrReinstall ${LANG_ENGLISH} "Add/Reinstall components"
LangString alreadyInstalled ${LANG_ENGLISH} "Already Installed"
LangString alreadyInstalledLong ${LANG_ENGLISH} "${PRODUCTNAME} ${VERSION} is already installed. Select the operation you want to perform and click Next to continue."
LangString appRunning ${LANG_ENGLISH} "${PRODUCTNAME} is running! Please close it first then try again."
LangString appRunningOkKill ${LANG_ENGLISH} "${PRODUCTNAME} is running!$\nClick OK to kill it"
LangString chooseMaintenanceOption ${LANG_ENGLISH} "Choose the maintenance option to perform."
LangString chooseHowToInstall ${LANG_ENGLISH} "Choose how you want to install ${PRODUCTNAME}."
LangString createDesktop ${LANG_ENGLISH} "Create desktop shortcut"
LangString dontUninstall ${LANG_ENGLISH} "Install over the existing installation (data and settings are kept)"
LangString dontUninstallDowngrade ${LANG_ENGLISH} "Do not uninstall (Downgrading without uninstall is disabled for this installer)"
LangString failedToKillApp ${LANG_ENGLISH} "Failed to kill ${PRODUCTNAME}. Please close it first then try again"
LangString installingWebview2 ${LANG_ENGLISH} "Installing WebView2..."
LangString newerVersionInstalled ${LANG_ENGLISH} "A newer version of ${PRODUCTNAME} is already installed! It is not recommended that you install an older version. If you really want to install this older version, it's better to uninstall the current version first. Select the operation you want to perform and click Next to continue."
LangString older ${LANG_ENGLISH} "older"
LangString olderOrUnknownVersionInstalled ${LANG_ENGLISH} "An $R4 version of ${PRODUCTNAME} is installed on your system. Installing over it updates the app in place; your progress and settings are kept. Select the operation you want to perform and click Next to continue."
LangString silentDowngrades ${LANG_ENGLISH} "Downgrades are disabled for this installer, can't proceed with the silent installer, please use the graphical interface installer instead.$\n"
LangString unableToUninstall ${LANG_ENGLISH} "Unable to uninstall!"
LangString uninstallApp ${LANG_ENGLISH} "Uninstall ${PRODUCTNAME}"
LangString uninstallBeforeInstalling ${LANG_ENGLISH} "Uninstall before installing"
LangString unknown ${LANG_ENGLISH} "unknown"
LangString webview2AbortError ${LANG_ENGLISH} "Failed to install WebView2! The app can't run without it. Try restarting the installer."
LangString webview2DownloadError ${LANG_ENGLISH} "Error: Downloading WebView2 Failed - $0"
LangString webview2DownloadSuccess ${LANG_ENGLISH} "WebView2 bootstrapper downloaded successfully"
LangString webview2Downloading ${LANG_ENGLISH} "Downloading WebView2 bootstrapper..."
LangString webview2InstallError ${LANG_ENGLISH} "Error: Installing WebView2 failed with exit code $1"
LangString webview2InstallSuccess ${LANG_ENGLISH} "WebView2 installed successfully"
LangString deleteAppData ${LANG_ENGLISH} "Delete the application data"
LangString gameHint ${LANG_ENGLISH} "${PRODUCTNAME} has been installed.$\r$\n$\r$\nIf ARC Raiders is running, start the app only after closing the game, or play in borderless window mode. Launching the app over a game in exclusive fullscreen can take focus from the game.$\r$\n$\r$\nClick Finish to close this wizard."

; 0.10.2: see hooks.nsh. Kept here because this file is included after Tauri declares its variables.
!ifndef ARC_PREFER_INPLACE_UPDATE
!define ARC_PREFER_INPLACE_UPDATE
Function ArcPreferInPlaceUpdate
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${If} $R0 != ""
    nsis_tauri_utils::SemverCompare "${VERSION}" $R0
    Pop $R0
    ${If} $R0 = 1
      StrCpy $ReinstallPageCheck 2
    ${EndIf}
  ${EndIf}
FunctionEnd
!endif
