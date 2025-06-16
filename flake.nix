{
  description = "Nix configs for my machines";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

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
