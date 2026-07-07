{
  self,
  inputs,
  pkgs,
  outputs,
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
      extra-substituters = [ "https://cache.flox.dev" ];
      extra-trusted-public-keys = [
        "flox-cache-public-1:7F4OyH7ZCnFhcze3fJdfyXYLQw/aV7GEed86nQ7IsOs="
      ];
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

  # darwin system configuration
  system = {
    # Set primary user
    primaryUser = "forrest.miller";

    # Set Git commit hash for darwin-version.
    configurationRevision = self.rev or self.dirtyRev or null;

    # Set dock to autohide
    # https://mynixos.com/options/system.defaults
    defaults = {
      dock = {
        autohide = true;
        tilesize = 40; # icon size in dock
        magnification = true;
        orientation = "left";
      };
      finder = {
        AppleShowAllFiles = true;
      };
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

  # Enable alternative shell support in nix-darwin.
  programs.zsh.enable = true;

}
