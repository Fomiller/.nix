{outputs, ... }:
{
  programs.direnv = {
    enable = true;
    enableZshIntegration = true;
    nix-direnv.enable = true;
    config = {
      global = {
        hide_env_diff = true;
        warn_timeout = "1h";
      };
    };
  };
}
