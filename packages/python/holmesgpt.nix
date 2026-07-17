{ lib, stdenvNoCC, fetchurl, unzip }:

# Not in nixpkgs. Upstream doesn't publish to PyPI in a way that's easy to
# build hermetically (Poetry project, heavy/optional AI-provider deps), but
# they do publish a self-contained PyInstaller "onedir" bundle per platform on
# GitHub Releases. Verified the darwin-arm64 bundle only links system
# libraries (libSystem, libz) plus its own bundled dylibs via @rpath — no
# Homebrew paths baked in — so it runs unmodified from the Nix store.
stdenvNoCC.mkDerivation rec {
  pname = "holmesgpt";
  version = "0.36.0";

  src = fetchurl {
    url = "https://github.com/HolmesGPT/holmesgpt/releases/download/${version}/holmes-darwin-arm64-${version}.zip";
    sha256 = "50f65c18dd5951cc5faf30e37232b3d037e1efe74c9826b9104a579d06cf306a";
  };

  nativeBuildInputs = [ unzip ];

  # PyInstaller onedir bundle: the `holmes` binary must stay next to its
  # `_internal/` support directory, so install both under libexec and symlink
  # just the entrypoint into bin.
  installPhase = ''
    runHook preInstall
    mkdir -p $out/libexec/holmesgpt $out/bin
    cp -r . $out/libexec/holmesgpt/
    ln -s $out/libexec/holmesgpt/holmes $out/bin/holmes
    runHook postInstall
  '';

  meta = with lib; {
    description = "AI agent for investigating and troubleshooting Kubernetes and production issues";
    homepage = "https://holmesgpt.dev";
    license = licenses.asl20;
    platforms = [ "aarch64-darwin" ];
    mainProgram = "holmes";
  };
}
