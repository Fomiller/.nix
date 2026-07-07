{ pkgs, inputs, ... }:
{
  # Installed directly from the flox flake's package output rather than its
  # homeModules.flox — that module also sets nix.settings, which would clash
  # with the hand-managed xdg.configFile."nix/nix.conf" in ../../common
  # (Determinate's daemon-level substituter trust is added separately via
  # /etc/nix/nix.custom.conf).
  home.packages = [ inputs.flox.packages.${pkgs.stdenv.hostPlatform.system}.default ];
}
