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
