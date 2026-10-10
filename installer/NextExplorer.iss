#ifndef PackageRoot
  #define PackageRoot "..\release\NextExplorer"
#endif
#ifndef OutputRoot
  #define OutputRoot "..\release"
#endif

[Setup]
AppId={{FD03F468-5405-49CD-9530-4FBCC6CE670D}
AppName=NextExplorer
AppVersion=1.0.0
DefaultDirName={localappdata}\Programs\NextExplorer
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
DisableDirPage=yes
UsePreviousAppDir=no
DisableProgramGroupPage=yes
DisableWelcomePage=no
WizardStyle=modern
OutputDir={#OutputRoot}
OutputBaseFilename=NextExplorer-Setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayName=NextExplorer (paquet et liaison navigateur)
SetupMutex=NextExplorerSetup
CloseApplications=no
RestartApplications=no

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Files]
Source: "{#PackageRoot}\*"; DestDir: "{tmp}\payload"; Flags: dontcopy recursesubdirs createallsubdirs
Source: "{#PackageRoot}\*"; DestDir: "{app}\package"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{srcexe}"; DestDir: "{app}"; DestName: "NextExplorer-Maintenance.exe"; Flags: external ignoreversion; Check: CopyMaintenance

[Icons]
Name: "{userprograms}\NextExplorer\Installer ou réparer"; Filename: "{app}\NextExplorer-Maintenance.exe"
Name: "{userprograms}\NextExplorer\Aide"; Filename: "{app}\package\README.md"
Name: "{userprograms}\NextExplorer\Dossier de l'extension"; Filename: "{app}\package\dist"

[Code]
var
  ConnectionPage: TInputQueryWizardPage;
  BrowserPage: TInputOptionWizardPage;
  PreviewPage: TWizardPage;
  PreviewText: TNewMemo;
  PayloadReady: Boolean;

function CopyMaintenance: Boolean;
begin
  Result := CompareText(ExpandConstant('{srcexe}'), ExpandConstant('{app}\NextExplorer-Maintenance.exe')) <> 0;
end;

function BrowserName: String;
begin
  case BrowserPage.SelectedValueIndex of
    1: Result := 'Edge';
    2: Result := 'Chromium';
    3: Result := 'All';
  else Result := 'Chrome';
  end;
end;

function ValidId(Value: String; RequiredLength: Integer; Alphabet: String): Boolean;
var I: Integer;
begin
  Result := Length(Value) = RequiredLength;
  if not Result then exit;
  for I := 1 to Length(Value) do
    if Pos(Value[I], Alphabet) = 0 then begin Result := False; exit; end;
end;

function ReadResult: String;
var Content: AnsiString;
begin
  if LoadStringFromFile(ExpandConstant('{tmp}\setup-result.txt'), Content) then
    Result := UTF8Decode(Content)
  else Result := 'Le programme de préparation n''a pas produit de résultat.';
end;

function RunBackend(Operation: String): Boolean;
var Params: String; Code: Integer;
begin
  DeleteFile(ExpandConstant('{tmp}\setup-result.txt'));
  Params := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{tmp}\payload\scripts\setup-host.ps1') + '" -Operation ' + Operation +
    ' -SourceRoot "' + ExpandConstant('{tmp}\payload') + '" -OutputFile "' +
    ExpandConstant('{tmp}\setup-result.txt') + '" -StateFile "' +
    ExpandConstant('{tmp}\setup-plan.xml') + '" -Browser ' + BrowserName +
    ' -ExtensionId ' + ConnectionPage.Values[0];
  if ConnectionPage.Values[1] <> '' then
    Params := Params + ' -RecoveryVersion ' + ConnectionPage.Values[1];
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Params, '', SW_HIDE, ewWaitUntilTerminated, Code);
  if Result then Result := Code = 0;
end;

procedure InitializeWizard;
var Id: AnsiString;
begin
  BrowserPage := CreateInputOptionPage(wpWelcome, 'Votre navigateur',
    'Installer ou réparer la liaison avec vos fichiers',
    'Choisissez le navigateur utilisé pour NextExplorer. Les autres installations seront conservées.', True, False);
  BrowserPage.Add('Chrome'); BrowserPage.Add('Edge'); BrowserPage.Add('Chromium'); BrowserPage.Add('Tous');
  BrowserPage.SelectedValueIndex := 0;
  ConnectionPage := CreateInputQueryPage(BrowserPage.ID, 'Connexion de l''extension',
    'Vérifiez l''identifiant avant de continuer',
    'L''identifiant du paquet est prérempli. Le choix d''une copie de moteurs sert uniquement à une réparation ambiguë.');
  ConnectionPage.Add('Identifiant de l''extension :', False);
  ConnectionPage.Add('Copie des moteurs (facultatif) :', False);
  ExtractTemporaryFiles('{tmp}\payload\extension-id.txt');
  if LoadStringFromFile(ExpandConstant('{tmp}\payload\extension-id.txt'), Id) then
    ConnectionPage.Values[0] := Trim(String(Id));
  PreviewPage := CreateCustomPage(ConnectionPage.ID, 'Corrections prévues',
    'Vérifiez le résultat avant de lancer l''installation.');
  PreviewText := TNewMemo.Create(PreviewPage);
  PreviewText.Parent := PreviewPage.Surface;
  PreviewText.SetBounds(0, 0, PreviewPage.SurfaceWidth, PreviewPage.SurfaceHeight);
  PreviewText.ReadOnly := True;
  PreviewText.ScrollBars := ssVertical;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = ConnectionPage.ID then begin
    if not ValidId(ConnectionPage.Values[0], 32, 'abcdefghijklmnop') then begin
      MsgBox('L''identifiant doit contenir 32 lettres de a à p.', mbError, MB_OK); Result := False; exit;
    end;
    if (ConnectionPage.Values[1] <> '') and not ValidId(ConnectionPage.Values[1], 32, '0123456789abcdef') then begin
      MsgBox('La copie des moteurs doit être un identifiant de 32 caractères hexadécimaux.', mbError, MB_OK); Result := False; exit;
    end;
    WizardForm.NextButton.Enabled := False;
    try
      if not PayloadReady then begin ExtractTemporaryFiles('{tmp}\payload\*'); PayloadReady := True; end;
      Result := RunBackend('Preview');
      PreviewText.Text := ReadResult;
      if not Result then MsgBox(PreviewText.Text, mbError, MB_OK);
    finally WizardForm.NextButton.Enabled := True; end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if CompareText(WizardDirValue, ExpandConstant('{localappdata}\Programs\NextExplorer')) <> 0 then
    Result := 'Le dossier de cette édition est fixe : l''installation doit rester dans votre compte Windows.';
  if not PayloadReady then Result := 'Le mode silencieux n''est pas pris en charge : utilisez l''aperçu de l''assistant.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    if not RunBackend('Apply') then RaiseException(ReadResult);
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
    WizardForm.FinishedLabel.Caption := 'Le paquet et la liaison navigateur sont prêts.' + #13#10#13#10 +
      'Dans chrome://extensions (ou edge://extensions), activez le mode développeur puis chargez ce dossier :' + #13#10 +
      ExpandConstant('{app}\package\dist') + #13#10#13#10 +
      'Si l''extension est déjà chargée ailleurs, rechargez-la depuis ce dossier. Désactivez puis réactivez l''extension pour vérifier la connexion.';
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var Code: Integer; Success: Boolean;
begin
  if CurUninstallStep <> usUninstall then exit;
  Success := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\package\scripts\install-host.ps1') + '" -Uninstall',
    '', SW_HIDE, ewWaitUntilTerminated, Code);
  if Success then Success := Code = 0;
  if not Success then RaiseException('La liaison navigateur n''a pas pu être retirée. Relancez l''assistant pour réparer le paquet.');
end;
