{
  config,
  lib,
  pkgs,
  atticCache,
  ...
}:
let
  # `attic watch-store` takes `servername:cachename`, resolved against
  # ~/.config/attic/config.toml.
  cacheRef = "${atticCache.serverName}:${atticCache.cacheName}";

  logFile = "${config.home.homeDirectory}/Library/Logs/attic-watch-store.log";
in
{
  home.packages = [ pkgs.attic-client ];

  # Watches /nix/store and pushes anything new to the cache, so a plain
  # `home-manager switch` populates it with no extra step. It computes
  # closures and skips paths already in cache.nixos.org, so a switch that
  # builds nothing uploads nothing.
  #
  # Gated on the same publicKey check as the substituter in hosts/*: the agent
  # can't do anything useful before the cache exists, and a KeepAlive agent
  # that exits immediately just churns.
  #
  # It authenticates from ~/.config/attic/config.toml, which `attic login`
  # writes. That's a one-time manual step per machine — the token is a
  # credential and doesn't belong in this repo.
  launchd.agents.attic-watch-store = lib.mkIf (atticCache.publicKey != "") {
    enable = true;
    config = {
      ProgramArguments = [
        (lib.getExe' pkgs.attic-client "attic")
        "watch-store"
        cacheRef
      ];
      RunAtLoad = true;
      KeepAlive = true;
      # Uploads are background work and shouldn't compete with the foreground
      # build that produced them.
      ProcessType = "Background";
      # If it is failing (no login yet, cache deleted, server down) this keeps
      # the retry loop cheap instead of respawning every 10 seconds.
      ThrottleInterval = 300;
      StandardOutPath = logFile;
      StandardErrorPath = logFile;
      EnvironmentVariables = {
        # launchd hands agents a near-empty PATH. attic talks to the daemon
        # over its socket rather than shelling out, but keep the Nix profile
        # dirs on PATH so anything it does exec resolves.
        PATH = "/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin:/usr/bin:/bin";
      };
    };
  };
}
