{...}:
{
  programs.tmux = {
    enable = true;
    keyMode = "vi";
    mouse = true;
    baseIndex = 1;
    historyLimit = 10000;
    extraConfig = ''
      set -g prefix C-a
      setw -g mode-keys vi

      # Use | and - to split a window vertically and horizontally instead of " and % respoectively
      unbind '"'
      unbind %
      bind v split-window -h -c "#{pane_current_path}"
      bind s split-window -v -c "#{pane_current_path}"

      # Reload tmux config by pressing prefix + R
      bind R source-file ~/.config/tmux/tmux.conf \; display "TMUX Conf Reloaded"

      # setup 'v' to begin selection as in vim
      bind-key -T copy-mode-vi v send -X begin-selection
      bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "pbcopy"
      bind P paste-buffer
    '';
  };
}
