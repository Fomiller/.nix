{
  config,
  pkgs,
  lib,
  userConfig,
  outputs,
  hostname,
  ...
}:
{
  imports = [
    ../filesystem
    ../programs/attic
    ../programs/bat
    ../programs/claude-code
    ../programs/direnv
    ../programs/flox
    ../programs/fzf
    ../programs/gh
    ../programs/git
    ../programs/k9s
    ../programs/lazygit
    ../programs/rbenv
    ../programs/starship
    ../programs/tmux
    ../programs/worktrunk
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

  # Determinate Nix doesn't ship a nix.conf with nix-command/flakes enabled
  # by default (nix.enable = false means nix-darwin won't manage it either),
  # so plain `nix` invocations fail without this.
  xdg.configFile."nix/nix.conf".text = "experimental-features = nix-command flakes\n";

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

        # nixpkgs' minikube derivation symlinks bin/kubectl -> bin/minikube
        # (a "minikube kubectl" convenience shim), which collides with the
        # standalone kubectl package below. Drop the symlink so both can
        # coexist in the same profile.
        minikube-no-kubectl = pkgs.minikube.overrideAttrs (oldAttrs: {
          postInstall = (oldAttrs.postInstall or "") + ''
            rm -f $out/bin/kubectl
          '';
        });

        packageGroups = {
          core = with pkgs; [
            neovim
            zoxide
          ];

          languages = with pkgs; [
            go
            deno
            nodejs
            pipenv
            python3
            python312Packages.pip
            rustup
            zig
          ];

          aiTools = with pkgs; [
            # claude-code is installed by programs.claude-code (it owns the
            # package for its managed-MCP plugin), not listed here.
            context-stats
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
            google-cloud-sdk
            # grafana from nixpkgs-unstable currently fails to build on
            # aarch64-darwin (yarn/sandbox EBADF error building web assets,
            # no binary cache available for our pinned revision) — use the
            # stable channel's prebuilt version instead.
            stable.grafana
            grafana-alloy
            htop
            hugo
            jq
            just
            lazydocker
            fastfetch
            minikube-no-kubectl
            postgresql_17_jit
            redis
            ripgrep
            saml2aws
            sops
            tfswitch
            tgswitch
            twitch-cli
            watch
            worktrunk
            yq-go
            lua51Packages.tree-sitter-cli
          ];

          # flock-cli lives in a private Flock repo, so it's only fetchable
          # (and only useful) on the work machine.
          flock =
            (with pkgs; [
              aws-iam-authenticator
              tailscale
            ])
            ++ lib.optional (hostname == "flock-mac") pkgs.flock-cli;

          k8s = with pkgs; [
            argocd
            kargo
            eksctl
            helm-dashboard
            holmesgpt
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
