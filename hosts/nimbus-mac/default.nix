{
  self,
  pkgs,
  outputs,
  ...
}:
{
  # The platform the configuration will be used on.
  nix = {
    # Necessary for using flakes on this system.
    settings.experimental-features = "nix-command flakes";

    # Necessary for using nix determinate
    enable = false;

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

  # Enable alternative shell support in nix-darwin.
  programs.zsh.enable = true;

}
