{
  lib,
  atticCache,
  ...
}:
let
  host = lib.removePrefix "https://" atticCache.endpoint;
  tokenFile = "/etc/nix/attic-token";
  netrc = "/nix/var/determinate/netrc";
in
{
  # Determinate pins netrc-file = /nix/var/determinate/netrc in its own
  # /etc/nix/nix.conf, after the !include of nix.custom.conf, so the path
  # can't be moved. What we can own is the attic line inside it.
  #
  # Reasserted on every activation on purpose: `determinate-nixd login`
  # rewrites this file for FlakeHub auth and drops the attic entry, which
  # turns every substitution into a silent 401.
  #
  # A macOS update reboot does the same thing — determinate-nixd rewrites the
  # file when it restarts, so every OS update costs a `just rebuild <host>`
  # before the cache works again. Hit on 2026-08-14 (macOS 15.7.9).
  #
  # If that gets annoying, move this to a launchd daemon with WatchPaths on the
  # netrc instead of (or alongside) activation. That catches every rewrite, not
  # just reboots. Don't use RunAtLoad — it races determinate-nixd's own startup
  # rewrite and launchd has no "after service X" ordering. WatchPaths needs a
  # guard that exits when the attic line is already correct, or the script's
  # own mv re-fires it forever.
  #
  # The token is bootstrapped out of band by `just attic-login` because
  # /nix/store is world-readable. That leaves one manual step per machine.
  # If that becomes annoying, this refactors to the sops-nix (or agenix)
  # pattern without touching the script — the token gets committed
  # encrypted and tokenFile becomes config.sops.secrets.attic-token.path.
  system.activationScripts.postActivation.text = lib.mkIf (atticCache.publicKey != "") ''
    if [ -r ${tokenFile} ]; then
      touch ${netrc}
      { grep -v '^machine ${host} ' ${netrc} || true; } > ${netrc}.tmp
      printf 'machine %s password %s\n' ${host} "$(cat ${tokenFile})" >> ${netrc}.tmp
      # Stays 0644: the nix client, not just the daemon, reads this file for
      # FlakeHub flake fetches.
      chmod 644 ${netrc}.tmp
      mv ${netrc}.tmp ${netrc}
    else
      echo "attic: no token at ${tokenFile}, skipping netrc. run 'just attic-login'" >&2
    fi
  '';
}
