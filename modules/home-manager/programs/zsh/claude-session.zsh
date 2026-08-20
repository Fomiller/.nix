# Kept out of default.nix's initContent so the ${...} expansions below don't
# all need nix's ''${ escaping.

# Name a Claude session after where it was launched: `repo` in a real
# checkout, `repo:branch` in a worktree. Suffixed -2, -3, ... when a live
# session already holds the name.
_claude_session_name() {
  local common root top base

  if common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
    root=${common:h}
    top=$(git rev-parse --show-toplevel 2>/dev/null)
    base=${root:t}
    [[ ${top:A} != ${root:A} ]] && base="${base}:${top:t}"
  else
    base=${PWD:t}
  fi
  base=${base#.}

  local -a live
  live=("${(@f)$(pgrep -fl -- '[-]-name ' 2>/dev/null)}")

  local name=$base line taken i=2
  while true; do
    taken=
    for line in "${live[@]}"; do
      if [[ " ${line} " == *" --name ${name} "* ]]; then
        taken=1
        break
      fi
    done
    [[ -z $taken ]] && break
    name="${base}-${i}"
    (( i++ ))
  done

  print -r -- "$name"
}

# Mirror a session name into the tmux window title as claude(<name>). Used by
# clc at launch and by claude-rename on every retitle.
_claude_tmux_rename() {
  [[ -n $TMUX && -n $TMUX_PANE && -n $1 ]] || return 0
  tmux rename-window -t "$TMUX_PANE" "claude($1)" 2>/dev/null
}

clc() {
  local -a extra
  local session_name i
  if [[ " $* " != *" --name "* && " $* " != *" -n "* ]]; then
    session_name=$(_claude_session_name)
    extra+=(--name "$session_name")
  else
    for (( i = 1; i <= $#; i++ )); do
      if [[ ${@[i]} == (--name|-n) ]]; then
        session_name=${@[i+1]}
        break
      fi
    done
  fi
  # An explicit socket path guarantees the session listens for control
  # messages. That socket is how `claude-rename` retitles a live session.
  if [[ " $* " != *" --messaging-socket-path "* ]]; then
    mkdir -p /tmp/cc-socks
    extra+=(--messaging-socket-path "/tmp/cc-socks/clc-$$-$RANDOM.sock")
  fi

  local win_name win_auto
  if [[ -n $TMUX && -n $TMUX_PANE && -n $session_name ]]; then
    win_name=$(tmux display-message -p -t "$TMUX_PANE" '#{window_name}' 2>/dev/null)
    win_auto=$(tmux display-message -p -t "$TMUX_PANE" '#{automatic-rename}' 2>/dev/null)
    _claude_tmux_rename "$session_name"
  fi

  command claude --dangerously-skip-permissions "${extra[@]}" "$@"
  local rc=$?

  # rename-window turns automatic-rename off for the window, so put it back
  # the way it was rather than just restoring the old string.
  if [[ -n $win_name ]]; then
    if [[ $win_auto == 1 ]]; then
      tmux set-window-option -t "$TMUX_PANE" automatic-rename on 2>/dev/null
    else
      tmux rename-window -t "$TMUX_PANE" "$win_name" 2>/dev/null
    fi
  fi
  return $rc
}
