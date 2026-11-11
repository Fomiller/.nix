{ inputs, ... }:
{
  rust = inputs.rust-overlay.overlays.default;

  # When applied, the stable nixpkgs set (declared in the flake inputs) will
  # be accessible through 'pkgs.stable'
  stable-packages = _final: prev: {
    stable = import inputs.nixpkgs-stable {
      system = prev.stdenv.hostPlatform.system;
      config.allowUnfree = true;
    };
  };

  # Local packages defined in ../packages, exposed on the top-level pkgs set.
  custom-packages = final: prev: {
    kiro-cli =
      let
        kiro = final.callPackage ../packages/kiro-cli.nix { };
      in
      prev.lib.warnIf (prev.lib.versionAtLeast prev.kiro-cli.version kiro.version)
        "nixpkgs kiro-cli ${prev.kiro-cli.version} has caught up with packages/kiro-cli.nix (${kiro.version}). Delete that file and the kiro-cli line in overlays/default.nix."
        kiro;
    rtk = final.callPackage ../packages/rust/rtk.nix { };
    context-stats = final.callPackage ../packages/python/context-stats.nix { };
    flock-cli = final.callPackage ../packages/go/flock-cli.nix { };
    holmesgpt = final.callPackage ../packages/python/holmesgpt.nix { };
  };
}
