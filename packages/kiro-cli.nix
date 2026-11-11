{
  lib,
  stdenv,
  fetchurl,
  versionCheckHook,
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "kiro-cli";
  version = "3.2.0";

  src = fetchurl {
    url = "https://desktop-release.q.us-east-1.amazonaws.com/${finalAttrs.version}/kirocli-universal-darwin.tar.gz";
    hash = "sha256-WxIkt6bZH4P3W81+RZv20u5+6c8N+MhJabk4NaJKe3k=";
  };

  sourceRoot = "kirocli";

  dontConfigure = true;
  dontBuild = true;
  dontStrip = true;
  dontFixup = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 bin/kiro-cli -t $out/bin
    runHook postInstall
  '';

  nativeInstallCheckInputs = [ versionCheckHook ];
  doInstallCheck = true;

  meta = {
    description = "Command-line interface for Kiro, an agentic IDE";
    homepage = "https://kiro.dev";
    license = lib.licenses.unfree;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
    mainProgram = "kiro-cli";
    platforms = [ "aarch64-darwin" ];
  };
})
