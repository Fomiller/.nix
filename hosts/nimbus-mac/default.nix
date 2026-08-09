{
  self,
  lib,
  pkgs,
  outputs,
  atticCache,
  ...
}:
{
  # Determinate Systems' own nix-darwin module manages Determinate Nix
  # directly (this forces nix.enable = false internally, and customSettings
  # is written to /etc/nix/nix.custom.conf, which Determinate's own
  # /etc/nix/nix.conf `!include`s).
  determinateNix = {
    enable = true;
    customSettings = {
      experimental-features = [
        "nix-command"
        "flakes"
      ];
      # Plain (not "trusted-") substituters are baked into the daemon's own
      # authoritative config, so they're used unconditionally for every
      # build — unlike trusted-substituters, which only pre-approves what an
      # already-trusted user may additionally request, and this machine's
      # only trusted-user is root.
      #
      # The Attic entries drop out entirely while atticCache.publicKey is
      # empty (see flake.nix) — the server mints the keypair at
      # `attic cache create`, so it doesn't exist before the first deploy.
      extra-substituters = [
        "https://cache.flox.dev"
      ] ++ lib.optional (atticCache.publicKey != "") "${atticCache.endpoint}/${atticCache.cacheName}";
      extra-trusted-public-keys = [
        "flox-cache-public-1:7F4OyH7ZCnFhcze3fJdfyXYLQw/aV7GEed86nQ7IsOs="
      ] ++ lib.optional (atticCache.publicKey != "") atticCache.publicKey;

      # No netrc-file here on purpose. The Attic cache is private, so the
      # daemon needs a token to pull from it, but Determinate pins
      # netrc-file = /nix/var/determinate/netrc in its own /etc/nix/nix.conf
      # (after the !include of this file, so it would win anyway) and the
      # module asserts against overriding it. The attic entry is appended to
      # that file by hand — see k8s/apps/attic/README.md in the homelab repo.
    };
  };

  nixpkgs = {
    hostPlatform = "aarch64-darwin";
    overlays = [
      outputs.overlays.stable-packages
      outputs.overlays.rust
    ];

    config = {
      allowUnfree = true;
    };

  };

  # nix-darwin's manual-build code passes a --toc-depth flag that upstream
  # nixos-render-docs (pulled in by our tracked nixpkgs-unstable) has
  # removed, and nix-darwin's master hasn't caught up yet. This breaks both
  # our own system manual build and darwin-uninstaller's separate internal
  # system config (which builds its own manual regardless of our
  # documentation settings) — disable both until upstream fixes it.
  documentation.doc.enable = false;
  system.tools.darwin-uninstaller.enable = false;

  # darwin system configuration
  system = {
    # Set primary user
    primaryUser = "forrest";

    # Set Git commit hash for darwin-version.
    configurationRevision = self.rev or self.dirtyRev or null;

    # Set dock to autohide
    defaults = {
      dock.autohide = true;
    };

    # Used for backwards compatibility, please read the changelog before changing.
    # $ darwin-rebuild changelog
    stateVersion = 6;
  };

  # List packages installed in system profile. To search by name, run:
  # $ nix-env -qaP | grep wget
  environment = {
    systemPackages = [
      pkgs.vim
    ];
  };

  fonts.packages = [
    pkgs.nerd-fonts.hack
  ];

  homebrew = {
    enable = true;
    taps = [ "redis-stack/redis-stack" ];
    casks = [
      "kegworks"
      "redis-stack-server"
    ];
  };

  # Enable alternative shell support in nix-darwin.
  programs.zsh.enable = true;

}
