{
  lib,
  buildGoModule,
}:
let
  version = "1.0.2";
in
buildGoModule {
  pname = "flock-cli";
  inherit version;

  # Private repo, so this is a builtins.fetchGit (evaluated as the user, uses
  # the ssh agent) rather than a fetchFromGitHub fixed-output derivation, which
  # would run in the sandbox with no credentials. Bump rev and version together.
  src = builtins.fetchGit {
    url = "ssh://git@github.com/flocksafety/flock-cli";
    ref = "refs/tags/v${version}";
    rev = "f0cf24c63d2b767428845769a526de792e19c0da";
  };

  vendorHash = "sha256-0JjdRluK0D5a4hTma8s5acDUnuQr/+yWvEOliUlROxg=";

  env.CGO_ENABLED = 0;

  ldflags = [
    "-s"
    "-w"
    "-X main.version=${version}"
    "-X main.builtBy=nix"
  ];

  # Module is named flock-cli, but the released binary is `flock`.
  postInstall = ''
    mv $out/bin/flock-cli $out/bin/flock
  '';

  meta = {
    description = "Flock Safety internal developer CLI";
    homepage = "https://github.com/flocksafety/flock-cli";
    mainProgram = "flock";
    platforms = lib.platforms.unix;
  };
}
