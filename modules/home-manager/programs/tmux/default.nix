{ ... }:
{
  programs.tmux = {
    enable = true;
    keyMode = "vi";
    mouse = true;
    baseIndex = 1;
    historyLimit = 10000;
    terminal = "tmux-256color";
    extraConfig = ''
      set -g prefix C-a
      setw -g mode-keys vi

      # Pass modifier-aware key sequences (e.g. Shift+Enter) through to apps like Claude Code
      set -s extended-keys always
      set -as terminal-features 'xterm-ghostty:extkeys'

      # Use | and - to split a window vertically and horizontally instead of " and % respoectively
      unbind '"'
      unbind %
      # bind v split-window -h -c "#{pane_current_path}"
      # bind s split-window -v -c "#{pane_current_path}"

      # New windows inherit the current pane's path
      bind c new-window -c "#{pane_current_path}"
      bind '"' split-window -v -c "#{pane_current_path}"
      bind % split-window -h -c "#{pane_current_path}"

      # Reload tmux config by pressing prefix + R
      bind R source-file ~/.config/tmux/tmux.conf \; display "TMUX Conf Reloaded"

      # setup 'v' to begin selection as in vim
      bind-key -T copy-mode-vi v send -X begin-selection
      bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "pbcopy"
      bind P paste-buffer

      # sesh config
      # telescope like search
      bind-key "T" run-shell "sesh connect \"$(
          sesh list --icons | fzf-tmux -p 80%,70% \
            --no-sort --ansi --border-label ' sesh ' --prompt '⚡  ' \
            --header '  ^a all ^t tmux ^g configs ^x zoxide ^d tmux kill ^f find' \
            --bind 'tab:down,btab:up' \
            --bind 'ctrl-a:change-prompt(⚡  )+reload(sesh list --icons)' \
            --bind 'ctrl-t:change-prompt(🪟  )+reload(sesh list -t --icons)' \
            --bind 'ctrl-g:change-prompt(⚙️  )+reload(sesh list -c --icons)' \
            --bind 'ctrl-x:change-prompt(📁  )+reload(sesh list -z --icons)' \
            --bind 'ctrl-f:change-prompt(🔎  )+reload(fd -H -d 2 -t d -E .Trash . ~)' \
            --bind 'ctrl-d:execute(tmux kill-session -t {2..})+change-prompt(⚡  )+reload(sesh list --icons)' \
            --preview-window 'right:55%' \
            --preview 'sesh preview {}'
      )\""

      bind-key x kill-pane # skip "kill-pane 1? (y/n)" prompt
      set -g detach-on-destroy off  # don't exit from tmux when closing a session

      # The default <prefix>+L command will "Switch the attached client back to the last session."
      # However, if you close a session while detach-on-destroy off is set, the last session will not be found.
      # To fix this, I have a sesh last command that will always switch the client to the second to last session that has been attached.
      bind -N "last-session (via sesh) " L run-shell "sesh last"

      set -g status-left-length 100
      set -g status-right-length 100

      set -g window-status-format '#I:#W'
      set -g window-status-current-format '#I:#W*'
    '';
  };
}
