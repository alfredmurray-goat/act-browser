; Inno Setup script for the Act Browser Windows installer. Built by
; scripts/package.mjs, which passes the defines below.
;
; It installs per user (no admin needed) into %LOCALAPPDATA%\Programs, so
; the built-in updater can replace the app later.

#ifndef AppVersion
  #error AppVersion is required
#endif

[Setup]
AppId={{5C3E2A4B-7D1F-4E8A-9B6C-ACB0E2F41D27}
AppName=Act Browser
AppVersion={#AppVersion}
AppVerName=Act Browser {#AppVersion}
AppPublisher=Act Browser
AppPublisherURL=https://github.com/{#Repo}
AppSupportURL=https://github.com/{#Repo}/issues
DefaultDirName={localappdata}\Programs\Act Browser
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename={#OutputName}
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\act.ico
UninstallDisplayName=Act Browser
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\Act Browser"; Filename: "{app}\firefox.exe"; IconFilename: "{app}\act.ico"
Name: "{userdesktop}\Act Browser"; Filename: "{app}\firefox.exe"; IconFilename: "{app}\act.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\firefox.exe"; Description: "{cm:LaunchProgram,Act Browser}"; Flags: nowait postinstall skipifsilent
