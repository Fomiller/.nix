{ lib, pkgs, ...}:
{
  home.activation.createDevDir = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    	mkdir -p "$HOME/dev/personal"
    	mkdir -p "$HOME/dev/work"
    	mkdir -p "$HOME/dev/third_party"
  '';

  home.activation.cloneNeovimConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    if [ ! -d "$HOME/.config/nvim" ]; then
      ${pkgs.git}/bin/git clone https://github.com/Fomiller/nvim.git "$HOME/.config/nvim"
    fi
  '';
}
