{ inputs, ... }:
{
  rust = inputs.rust-overlay.overlays.default;

  # When applied, the stable nixpkgs set (declared in the flake inputs) will
  # be accessible through 'pkgs.stable'
  stable-packages = final: _prev: {
    stable = import inputs.nixpkgs-stable {
      system = final.system;
      config.allowUnfree = true;
    };
  };

  # Local packages defined in ../packages, exposed on the top-level pkgs set.
  custom-packages = final: _prev: {
    rtk = final.callPackage ../packages/rtk.nix { };
  };
}
