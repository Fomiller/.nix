{
  description = "Nix configs for my machines";

  inputs = {
    # TEMPORARILY PINNED past nixpkgs-unstable's usual rolling tracking.
    # Rev 38affae6a5768f9b61f81355c7558ee971b2afb1 (and later, as of
    # 2026-07-26) refactored nixos/modules/system/service/systemd/service.nix
    # into a curried two-stage function (`{ pkgs }: { lib, config, ... }: ...`
    # instead of a plain `{ lib, config, systemdPackage, ... }: ...` module).
    # home-manager's modules/services-modular/service.nix imports that file
    # directly as a bare path, which only works with the old single-stage
    # shape - the module system's auto-import ends up calling the outer
    # `{ pkgs }:` lambda with `lib` too, erroring with "function 'anonymous
    # lambda' called with unexpected argument 'lib'" during
    # `home-manager switch`. Confirmed home-manager's master (rev
    # 079a3b5d1aa6a719920a51316253b7d6dd22738d at the time) hadn't adapted to
    # this yet, so it's not something `nix flake update` alone will fix.
    # Un-pin (revert to the nixpkgs-unstable branch tracking below) once
    # home-manager's services-modular code catches up:
    #   nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nixpkgs.url = "github:NixOS/nixpkgs/7525d999cd850b9a488817abc89c75dc733acf17";

    nixpkgs-stable.url = "github:nixos/nixpkgs/nixos-25.05";

    darwin = {
      url = "github:nix-darwin/nix-darwin/master";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Not pinned to our nixpkgs so it keeps hitting Flox's own binary cache
    # (cache.flox.dev). The "latest" branch specifically (not the default
    # branch) is what the cache actually has prebuilt artifacts for.
    flox.url = "github:flox/flox/latest";

    # Determinate Systems' own nix-darwin module for managing Determinate
    # Nix declaratively (customSettings -> /etc/nix/nix.custom.conf),
    # replacing our own hand-rolled nix.enable = false + environment.etc.
    determinate.url = "https://flakehub.com/f/DeterminateSystems/determinate/3";

    # _1password-shell-plugins.url = "github:1Password/shell-plugins";

    # nix-homebrew.url = "github:zhaofengli/nix-homebrew";
    #
    # homebrew-core = {
    #     url = "github:homebrew/homebrew-core";
    #     flake = false;
    # };
    #
    # homebrew-cask = {
    #   url = "github:homebrew/homebrew-cask";
    #   flake = false;
    # };

  };

  outputs =
    {
      self,
      darwin,
      home-manager,
      nixpkgs,
      rust-overlay,
      ...
    }@inputs:
    let
      inherit (self) outputs;

      users = {
        "forrest" = {
          email = "forrestmillerj@gmail.com";
          fullName = "Forrest Miller";
          firstName = "forrest";
          lastName = "miller";
          username = "forrest";
        };
        "forrest.miller" = {
          email = "forrest.millerj@flocksafety.com";
          fullName = "Forrest Miller";
          firstName = "forrest";
          lastName = "miller";
          username = "forrest.miller";
        };
      };

      # Function for nix-darwin system configuration
      mkDarwinConfiguration =
        hostname: username:
        darwin.lib.darwinSystem {
          system = "aarch64-darwin";
          specialArgs = {
            inherit
              self
              inputs
              outputs
              hostname
              ;
            userConfig = users.${username};
          };
          modules = [
            ./hosts/${hostname} # this is configuration
            home-manager.darwinModules.home-manager
            inputs.determinate.darwinModules.default
          ];
        };

      # Function for Home Manager configuration
      mkHomeConfiguration =
        system: hostname: username:
        home-manager.lib.homeManagerConfiguration {
          pkgs = import nixpkgs { inherit system; };
          extraSpecialArgs = {
            inherit inputs outputs;
            userConfig = users.${username};
            nhModules = "${self}/modules/home-manager";
          };
          modules = [
            "${self}/home/${hostname}"
          ];
        };
    in
    {
      # new config
      darwinConfigurations = {
        "nimbus" = mkDarwinConfiguration "nimbus-mac" "forrest";
        "flock" = mkDarwinConfiguration "flock-mac" "forrest";
      };

      homeConfigurations = {
        "nimbus" = mkHomeConfiguration "aarch64-darwin" "nimbus-mac" "forrest";
        "flock" = mkHomeConfiguration "aarch64-darwin" "flock-mac" "forrest.miller";
      };

      overlays = import ./overlays { inherit inputs; };

      # old config

      # Build darwin flake using:
      # $ darwin-rebuild build --flake .#Forrest-Miller-C414226KGQ
      # darwinConfigurations."Forrest-Miller-C414226KGQ" = darwin.lib.darwinSystem {
      #   modules = [
      #     configuration
      #     home-manager.darwinModules.home-manager
      #     {
      #       users.users."forrest.miller".home = "/Users/forrest.miller";
      #       home-manager.useGlobalPkgs = true;
      #       home-manager.useUserPackages = true;
      #
      #       home-manager.users."forrest.miller" = ./modules/home-manger/default.nix;
      #       home-manager.backupFileExtension = "bak";
      #     }
      #
      #     # Something is broken with previous install overlap probably just going to use normal install
      #     # nix-homebrew.darwinModules.nix-homebrew
      #     # {
      #     #     nix-homebrew = {
      #     #         # Install Homebrew under the default prefix
      #     #         enable = true;
      #     #
      #     #         # Apple Silicon Only: Also install Homebrew under the default Intel prefix for Rosetta 2
      #     #         enableRosetta = true;
      #     #
      #     #         # Optional: Declarative tap management
      #     #         taps = {
      #     #             "homebrew/homebrew-core" = homebrew-core;
      #     #             "homebrew/homebrew-cask" = homebrew-cask;
      #     #         };
      #     #
      #     #         mutableTaps = false;
      #     #
      #     #         # User owning the Homebrew prefix
      #     #         user = "forrest.miller";
      #     #         autoMigrate = true;
      #     #     };
      #     # }
      #
      #     (
      #       { pkgs, ... }:
      #       {
      #         nixpkgs.overlays = [ rust-overlay.overlays.default ];
      #         environment.systemPackages = [
      #           (pkgs.rust-bin.stable.latest.default.override {
      #             extensions = [
      #               "rust-src"
      #               "rust-analyzer"
      #             ];
      #           })
      #         ];
      #       }
      #     )
      #   ];
      # };
    };
}
