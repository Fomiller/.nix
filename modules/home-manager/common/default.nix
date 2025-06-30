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
    ../filesystem
    ../programs/direnv
    ../programs/gh
    ../programs/git
    ../programs/starship
    ../programs/tmux
    ../programs/zoxide
    ../programs/zsh
    ../programs/rbenv
    ../programs/k9s
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

    sessionPath = [
      "$HOME/bin"
      "$HOME/.local/bin"
    ];

    packages =
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
            ansible
            awscli2
            bottom
            btop
            coreutils
            direnv
            doppler
            fzf
            htop
            jq
            just
            lazydocker
            neofetch
            redis
            ripgrep
            saml2aws
            sops
            tfswitch
            tgswitch
            yq
          ];

          flock = with pkgs; [
            aws-iam-authenticator
            tailscale
          ];

          k8s = with pkgs; [
            argocd
            eksctl
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
  };
}
