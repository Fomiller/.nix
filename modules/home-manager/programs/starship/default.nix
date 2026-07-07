{ ... }:
{
  programs.starship = {
    enable = true;
    settings = {
      add_newline = false;
      line_break = {
        disabled = true;
      };
      aws = {
        # see formatting strings docs https://starship.rs/config/
        format = "[($profile )(\\[$duration\\])]($style)";
      };
      helm = {
        symbol = " ";
      };
      rust = {
        symbol = " ";
      };
      terraform = {
        symbol = " ";
      };
      # Starship has no built-in flox module (only nix_shell/direnv), so this
      # reads the env var flox activate itself exports to list active
      # environments.
      env_var.flox = {
        variable = "FLOX_PROMPT_ENVIRONMENTS";
        format = "[flox:$env_value]($style) ";
        style = "bold blue";
        disabled = false;
      };
      kubernetes = {
        disabled = false;
        style = "bold pink";
        symbol = "󱃾 ";
        format = "[$symbol$context( \($namespace\))]($style)";
        contexts = [
          {
            context_pattern = "arn:aws:eks:(?P<var_region>.*):(?P<var_account>[0-9]{12}):cluster/(?P<var_cluster>.*)";
            context_alias = "$var_cluster";
          }
        ];
      };
      right_format = "$kubernetes $aws";
    };
  };
}
