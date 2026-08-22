{
  inputs,
  nhModules,
  pkgs,
  ...
}:
{
  imports = [
    "${nhModules}/common"
    # Work (AWS Bedrock) HolmesGPT wiring.
    "${nhModules}/programs/k9s/flock.nix"
    "${nhModules}/programs/zsh/flock.nix"
    # inputs._1password-shell-plugins.hmModules.default
  ];

  # Enable home-manager
  programs = {
    home-manager = {
      enable = true;
    };
    # _1password-shell-plugins = {
    #   # enable 1Password shell plugins for bash, zsh, and fish shell
    #   enable = true;
    #   # the specified packages as well as 1Password CLI will be
    #   # automatically installed and configured to use shell plugins
    #   plugins = with pkgs; [
    #     gh
    #     cachix
    #   ];
    # };
  };

  # https://nixos.wiki/wiki/FAQ/When_do_I_update_stateVersion
  home.stateVersion = "25.05";
}
