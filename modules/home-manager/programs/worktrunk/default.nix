{ config, ... }:
let
  worktrunkDir = "${config.home.homeDirectory}/dev/personal/.nix/modules/home-manager/programs/worktrunk";
in
{
  # `wt config approvals` and friends rewrite this file at runtime, so it's an
  # out-of-store symlink into the live checkout rather than a read-only store
  # copy — same reason as the claude-code files.
  xdg.configFile."worktrunk/config.toml".source =
    config.lib.file.mkOutOfStoreSymlink "${worktrunkDir}/config.toml";
}
