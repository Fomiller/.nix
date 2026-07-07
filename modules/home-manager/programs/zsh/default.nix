{ ... }:
{
  programs.zsh = {
    enable = true;
    shellAliases = {
      # vim
      vim = "nvim";
      vi = "nvim";
      # claude code
      cl = "claude";
      clc = "claude --dangerously-skip-permissions";
      # git
      ga = "git add";
      gp = "git pull";
      gs = "git status";
      gc = "git commit -m";
      gcm = "git commit -m";
      gco = "git checkout";
      gcob = "git checkout -b";
      gco- = "git checkout -";
      gl = "git log";
      gd = "git diff";
      gr = "git restore";
      grs = "git restore --staged";
      gb = "git checkout $(git branch | grep -v '^\*' | fzf --height=20% --reverse --info=inline)";
      branch = "git checkout $(git branch | grep -v '^\*' | fzf --height=20% --reverse --info=inline)";
      # filesystem
      ll = "ls -la";
      la = "ls -a";
      lt = "ls --tree";
      # config editing
      zshconfig = "vim ~/.zshrc";
      vimconfig = "vim ~/.config/nvim/init.lua";
      muxconfig = "vim ~/.tmux.conf";
      # tmux
      mux = "tmuxinator";
      # git
      lg = "lazygit";
      # kubernetes
      k = "kubectl";
      kx = "kubectx";
      ktx = "kubectx";
      k9 = "k9s";
      # programs
      top = "ytop";
    };
    initContent = ''
      export GOPATH="$HOME/go"
      export GOBIN="$HOME/go/bin"
      export EDITOR="nvim"
      export PATH="$HOME/.opencode/bin:$PATH"
      export TERRAGRUNT_FORWARD_TF_STDOUT=1
      export AWS_ASSUME_CONFIG_DIR="$HOME"

      alias mega='docker run -it --rm \
          --name megatainer-''${PWD##*/} \
          --env-file <(doppler secrets download --no-file --format docker) \
          -w /home/workspace/ \
          -v $HOME/.ssh:$HOME \
          -v $PWD/:/home/workspace/:rw,z fomiller/megatainer:latest'

      alias mega-local='docker run -it --rm \
          --name megatainer-''${PWD##*/} \
          --env-file <(doppler secrets download --no-file --format docker) \
          -w /home/workspace/ \
          -v $HOME/.ssh:$HOME \
          -v $PWD/:/home/workspace/:rw,z fomiller/megatainer:local'

      function sesh-sessions() {
        {
          exec </dev/tty
          exec <&1
          local session
          session=$(sesh list -t -c | fzf --height 30% --reverse --border-label ' sesh ' --border --prompt '⚡  ')
          zle reset-prompt > /dev/null 2>&1 || true
          [[ -z "$session" ]] && return
          sesh connect $session
        }
      }

      zle     -N             sesh-sessions
      bindkey -M emacs '\es' sesh-sessions
      bindkey -M vicmd '\es' sesh-sessions
      bindkey -M viins '\es' sesh-sessions

      # Move fzf's cd widget off Alt-C (\ec) onto Ctrl-G instead.
      bindkey -r '\ec'
      bindkey -M emacs '^G' fzf-cd-widget
      bindkey -M vicmd '^G' fzf-cd-widget
      bindkey -M viins '^G' fzf-cd-widget
    '';
  };
}
