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
    [
      pkgs.ansible
      pkgs.argocd
      pkgs.aws-iam-authenticator
      pkgs.awscli
      pkgs.bottom
      pkgs.btop
      pkgs.coreutils
      pkgs.deno
      pkgs.direnv
      pkgs.docker
      pkgs.eksctl
      pkgs.fh
      pkgs.fx
      pkgs.git-lfs
      pkgs.glow
      pkgs.gnupg
      pkgs.gnutar
      pkgs.gnutls
      pkgs.go
      pkgs.htop
      pkgs.jq
      pkgs.just
      pkgs.k9s
      pkgs.kubectl
      pkgs.kubectx
      pkgs.kubernetes-helm
      pkgs.kustomize
      pkgs.lazydocker
      pkgs.neofetch
      pkgs.neovim
      pkgs.nixfmt-rfc-style
      pkgs.pipenv
      pkgs.python3
      pkgs.python312Packages.pip
      pkgs.redis
      pkgs.ripgrep
      pkgs.rustup
      pkgs.saml2aws
      pkgs.sops
      pkgs.stow
      pkgs.tfswitch
      pkgs.tgswitch
      pkgs.tree
      pkgs.wget
      pkgs.yq
      pkgs.zig
      pkgs.zoxide
    ]
    ++ lib.optionals pkgs.stdenv.isDarwin [
      pkgs.docker
      pkgs.raycast
    ];
}
