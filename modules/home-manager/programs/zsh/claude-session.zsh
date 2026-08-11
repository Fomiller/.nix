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

clc() {
  local -a extra
  if [[ " $* " != *" --name "* && " $* " != *" -n "* ]]; then
    extra+=(--name "$(_claude_session_name)")
  fi
  # An explicit socket path guarantees the session listens for control
  # messages. That socket is how `claude-rename` retitles a live session.
  if [[ " $* " != *" --messaging-socket-path "* ]]; then
    mkdir -p /tmp/cc-socks
    extra+=(--messaging-socket-path "/tmp/cc-socks/clc-$$-$RANDOM.sock")
  fi
  command claude --dangerously-skip-permissions "${extra[@]}" "$@"
}
