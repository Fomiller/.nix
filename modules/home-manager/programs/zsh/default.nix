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
      # clc is a function (git worktree launcher), see initContent below.
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

      # Secrets/API keys (e.g. ANTHROPIC_API_KEY) live outside this git repo.
      # Create this file by hand; it's never read or written by nix.
      [ -f "$HOME/.config/zsh/secrets.zsh" ] && source "$HOME/.config/zsh/secrets.zsh"

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

      # clc: run claude in a fresh git worktree, so several tickets can be in
      # flight in one repo at once. Worktrees go in ~/dev/worktrees/<repo>/<branch>
      # and branch off a freshly fetched origin HEAD. First arg is the branch
      # name; anything starting with `-` is passed through to claude instead.
      function clc() {
        local branch=""
        if [[ -n "$1" && "$1" != -* ]]; then
          branch="$1"
          shift
        fi
        local claude_args=("$@")

        local common_dir
        if ! common_dir=$(git rev-parse --git-common-dir 2>/dev/null); then
          claude --dangerously-skip-permissions "''${claude_args[@]}"
          return
        fi
        # :A makes it absolute; :h then gives the main worktree's root, so this
        # works the same when invoked from inside an existing worktree.
        common_dir=''${common_dir:A}
        local repo_root=''${common_dir:h}
        local repo=''${repo_root:t}

        [[ -z "$branch" ]] && branch="claude-$(date +%Y%m%d-%H%M%S)"

        local wt_root="$HOME/dev/worktrees/$repo"
        local wanted="$branch"
        local wt="$wt_root/$branch"
        local n=2
        while [[ -e "$wt" ]] || git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch"; do
          branch="$wanted-$n"
          wt="$wt_root/$branch"
          (( n++ ))
        done

        local base="HEAD"
        if git -C "$repo_root" remote get-url origin >/dev/null 2>&1; then
          git -C "$repo_root" fetch --quiet origin || return 1
          local head_ref
          head_ref=$(git -C "$repo_root" symbolic-ref --quiet refs/remotes/origin/HEAD)
          if [[ -z "$head_ref" ]]; then
            git -C "$repo_root" remote set-head origin --auto >/dev/null 2>&1
            head_ref=$(git -C "$repo_root" symbolic-ref --quiet refs/remotes/origin/HEAD)
          fi
          [[ -n "$head_ref" ]] && base="$head_ref"
        fi

        mkdir -p "$wt_root"
        git -C "$repo_root" worktree add -b "$branch" "$wt" "$base" || return 1
        cd "$wt" || return 1
        claude --dangerously-skip-permissions "''${claude_args[@]}"
      }

      # The `holmes` CLI wrapper (default model/backend) is host-specific:
      # nimbus uses a personal Anthropic API key, flock uses AWS Bedrock via
      # a work SSO profile. See ./nimbus.nix and ./flock.nix.

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
