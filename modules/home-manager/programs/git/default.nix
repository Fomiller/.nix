{ userConfig, ... }:
{
  programs.git = {
    enable = true;

    userName = "Forrest Miller";
    userEmail = "forrestmillerj@gmail.com";

    # aliases = {
    #   ga = "add";
    #   gs = "status";
    #   gc = "commit";
    #   gl = "log";
    #   gd = "diff";
    # };

    extraConfig = {
      core.editor = "nvim";
      core.autocrlf = "input";

      pull.rebase = "true";
      pull.default = "simple";

      push.autoSetupRemote = "true";

      color.ui = "auto";
    };

    #   delta = {
    #     enable = true;
    #     options = {
    #       keep-plus-minus-markers = true;
    #       light = false;
    #       line-numbers = true;
    #       navigate = true;
    #       width = 280;
    #     };
    #   };

  };
}
