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
    ../programs/k9s
    ../programs/rbenv
    ../programs/starship
    ../programs/tmux
    ../programs/zoxide
    ../programs/zsh
  ];

  # Nixpkgs configuration
  nixpkgs = {
    overlays = [
      outputs.overlays.stable-packages
      outputs.overlays.custom-packages
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
      "$HOME/go/bin"
    ];

    packages =
      let
        go-migrate-pg = pkgs.go-migrate.overrideAttrs (oldAttrs: {
          tags = [ "postgres" ];
        });

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

          aiTools = with pkgs; [
            claude-code
            rtk
            github-mcp-server
          ];

          devTools = with pkgs; [
            act
            json2ts
            eslint
            ansible
            awscli2
            bottom
            btop
            chamber
            coreutils
            direnv
            doppler
            dyff
            fzf
            go-migrate-pg
            htop
            jq
            just
            lazydocker
            fastfetch
            postgresql_17_jit
            redis
            ripgrep
            saml2aws
            sops
            tfswitch
            tgswitch
            yq-go
            lua51Packages.tree-sitter-cli
          ];

          flock = with pkgs; [
            aws-iam-authenticator
            tailscale
          ];

          k8s = with pkgs; [
            argocd
            kargo
            eksctl
            helm-dashboard
            kubebuilder
            kubectl
            kubectx
            kubernetes-helm
            kubernetes-helmPlugins.helm-diff
            kubernetes-helmPlugins.helm-dt
            kubernetes-helmPlugins.helm-git
            kubernetes-helmPlugins.helm-s3
            kubernetes-helmPlugins.helm-secrets
            kubernetes-helmPlugins.helm-unittest
            kustomize
            vendir
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
            sesh
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
      ++ packageGroups.aiTools
      ++ packageGroups.devTools
      ++ packageGroups.extras
      ++ packageGroups.flock
      ++ packageGroups.k8s
      ++ packageGroups.languages
      ++ lib.optionals pkgs.stdenv.isDarwin packageGroups.mac;
  };
}
