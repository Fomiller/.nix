{
  config,
  pkgs,
  lib,
  userConfig,
  outputs,
  ...
}:
{
  imports = [
    ../programs/direnv
    ../filesystem
    ../programs/gh
    ../programs/git
    ../programs/starship
    ../programs/tmux
    ../programs/zoxide
    ../programs/zsh
  ];

  # Nixpkgs configuration
  nixpkgs = {
    overlays = [
      outputs.overlays.stable-packages
    ];

    config = {
      allowUnfree = true;
    };
  };

  home = {
    username = "${userConfig.username}";
    homeDirectory =
      if pkgs.stdenv.isDarwin then "/Users/${userConfig.username}" else "/home/${userConfig.username}";
  };

  home.packages =
    let
      packageGroups = {
        core = with pkgs; [
          neovim
          zoxide
        ];

        languages = with pkgs; [
          go
          deno
          pipenv
          python3
          python312Packages.pip
          rustup
          zig
        ];

        devTools = with pkgs; [
          awscli
          ansible
          bottom
          btop
          coreutils
          direnv
          htop
          jq
          just
          lazydocker
          neofetch
          tfswitch
          tgswitch
          saml2aws
          redis
          ripgrep
          sops
          yq
        ];

        flock = with pkgs; [ aws-iam-authenticator ];

        k8s = with pkgs; [
          argocd
          eksctl
          k9s
          kubectl
          kubectx
          kubernetes-helm
          kustomize
        ];

        extras = with pkgs; [
          fh
          fx
          git-lfs
          glow
          gnupg
          gnutar
          gnutls
          nixfmt-rfc-style
          stow
          tree
          wget
        ];

        mac = with pkgs; [
          docker
          raycast
        ];
      };
    in
    packageGroups.core
    ++ packageGroups.languages
    ++ packageGroups.devTools
    ++ packageGroups.flock
    ++ packageGroups.k8s
    ++ packageGroups.extras
    ++ lib.optionals pkgs.stdenv.isDarwin packageGroups.mac;
}
