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
    # `use flox` in a project's .envrc. Runs bare `flox activate` (no -D) from
    # inside the project directory, where its .flox actually lives, so it
    # succeeds without needing a FloxHub login or Flox's own experimental
    # cd-detection hook.
    stdlib = ''
      use_flox() {
        eval "$(flox activate)"
      }
    '';
  };
}
