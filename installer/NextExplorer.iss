#ifndef PackageRoot
  #define PackageRoot "..\release\NextExplorer"
#endif
#ifndef OutputRoot
  #define OutputRoot "..\release"
#endif
#ifndef ReleaseVersion
  #error ReleaseVersion must be supplied by scripts/build-setup.ps1
#endif

[Setup]
AppId={{FD03F468-5405-49CD-9530-4FBCC6CE670D}
AppName=NextExplorer
AppVersion={#ReleaseVersion}
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
Name: "{userprograms}\NextExplorer\Aide"; Filename: "{app}\package\GUIDE_UTILISATION.md"
Name: "{userprograms}\NextExplorer\Dossier de l'extension"; Filename: "{app}\package\dist"

[Run]
Filename: "{code:StoreURL}"; Description: "Ouvrir la fiche Chrome Web Store"; Flags: shellexec postinstall unchecked skipifsilent; Check: OfferStore

[Code]
var
  ConnectionPage: TInputQueryWizardPage;
  BrowserPage: TInputOptionWizardPage;
  AdvancedSettings: TNewCheckBox;
  PackagedId: String;
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

function OfferStore: Boolean;
begin
  Result := (BrowserPage.SelectedValueIndex = 0) and not AdvancedSettings.Checked;
end;

function StoreURL(Param: String): String;
begin
  Result := 'https://chromewebstore.google.com/detail/' + PackagedId;
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
    'Installer, mettre à jour ou réparer la liaison avec vos fichiers',
    'Choisissez le navigateur utilisé pour NextExplorer. Les autres installations seront conservées.', True, False);
  BrowserPage.Add('Chrome'); BrowserPage.Add('Edge'); BrowserPage.Add('Chromium'); BrowserPage.Add('Tous');
  BrowserPage.SelectedValueIndex := 0;
  BrowserPage.CheckListBox.Height := BrowserPage.SurfaceHeight - BrowserPage.CheckListBox.Top - ScaleY(44);
  AdvancedSettings := TNewCheckBox.Create(BrowserPage);
  AdvancedSettings.Parent := BrowserPage.Surface;
  AdvancedSettings.SetBounds(0, BrowserPage.SurfaceHeight - ScaleY(28), BrowserPage.SurfaceWidth, ScaleY(24));
  AdvancedSettings.Caption := 'Afficher les réglages avancés (réparation ou développement)';
  AdvancedSettings.Checked := False;
  ConnectionPage := CreateInputQueryPage(BrowserPage.ID, 'Réglages avancés',
    'Uniquement pour une réparation particulière ou le développement',
    'L''installation normale utilise automatiquement l''identité de ce paquet. Ne modifiez ces valeurs que pour une intervention précise.');
  ConnectionPage.Add('Identifiant de l''extension :', False);
  ConnectionPage.Add('Copie des moteurs (facultatif) :', False);
  ExtractTemporaryFiles('{tmp}\payload\extension-id.txt');
  if LoadStringFromFile(ExpandConstant('{tmp}\payload\extension-id.txt'), Id) then
    PackagedId := Trim(String(Id));
  ConnectionPage.Values[0] := PackagedId;
  PreviewPage := CreateCustomPage(ConnectionPage.ID, 'Corrections prévues',
    'Vérifiez le résultat avant de lancer l''installation.');
  PreviewText := TNewMemo.Create(PreviewPage);
  PreviewText.Parent := PreviewPage.Surface;
  PreviewText.SetBounds(0, 0, PreviewPage.SurfaceWidth, PreviewPage.SurfaceHeight);
  PreviewText.ReadOnly := True;
  PreviewText.ScrollBars := ssVertical;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = ConnectionPage.ID) and not AdvancedSettings.Checked;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = BrowserPage.ID) and not AdvancedSettings.Checked then begin
    { Returning to the normal path must discard hidden repair overrides. }
    ConnectionPage.Values[0] := PackagedId;
    ConnectionPage.Values[1] := '';
  end;
  if (CurPageID = ConnectionPage.ID) or
     ((CurPageID = BrowserPage.ID) and not AdvancedSettings.Checked) then begin
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
  if CurPageID = wpFinished then begin
    WizardForm.FinishedLabel.Caption := 'Le compagnon Windows est prêt.' + #13#10#13#10 +
      'Revenez dans NextExplorer puis cliquez sur « Vérifier la connexion ». Vous pourrez ensuite choisir votre premier dossier.';
    if OfferStore then
      WizardForm.FinishedLabel.Caption := WizardForm.FinishedLabel.Caption + #13#10#13#10 +
        'Si l''extension manque, ajoutez-la depuis le Chrome Web Store. Le compagnon ne l''installe pas silencieusement.'
    else
      WizardForm.FinishedLabel.Caption := WizardForm.FinishedLabel.Caption + #13#10#13#10 +
        'Chargement avancé : dans la gestion des extensions, activez le mode développeur puis chargez :' + #13#10 + ExpandConstant('{app}\package\dist');
    WizardForm.FinishedLabel.Caption := WizardForm.FinishedLabel.Caption + #13#10#13#10 +
      'Les moteurs images, vidéo et archives avancées sont facultatifs. Consultez « Réglages et moteurs » dans l''extension.' + #13#10#13#10 +
      'Après une mise à jour, désactivez puis réactivez l''extension avant de vérifier la connexion.';
  end;
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
