{
  lib,
  rustPlatform,
  fetchFromGitHub,
}:
rustPlatform.buildRustPackage rec {
  pname = "rtk";
  version = "0.37.2";

  src = fetchFromGitHub {
    owner = "rtk-ai";
    repo = "rtk";
    rev = "v${version}";
    hash = "sha256-rNuu8B5TnKZHrbVSV8HkcTeTdcol26259GGJEPEMPZY=";
  };

  cargoHash = "sha256-61+PNuVF8H5+9PHc3MBt8V80ieBBi8HzSC9Gc/WUSzM=";

  # Several unit tests depend on real git state, $HOME, or network — skip in sandbox.
  doCheck = false;

  meta = with lib; {
    description = "CLI proxy that reduces LLM token consumption by 60-90% on common dev commands";
    homepage = "https://github.com/rtk-ai/rtk";
    license = licenses.mit;
    mainProgram = "rtk";
    platforms = platforms.unix;
  };
}
