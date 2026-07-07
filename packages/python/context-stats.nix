{ lib, python3Packages }:

python3Packages.buildPythonApplication rec {
  pname = "context-stats";
  version = "1.23.0";
  pyproject = true;

  src = python3Packages.fetchPypi {
    inherit pname version;
    hash = "sha256-xovcaNrSP44SxZ7WHymHnDgFeORckTj0FFxhcsILq7Y=";
  };

  build-system = with python3Packages; [
    hatchling
  ];

  meta = with lib; {
    description = "Context usage statistics and status line for Claude Code";
    homepage = "https://github.com/luongnv89/context-stats";
    license = licenses.mit;
    mainProgram = "context-stats";
  };
}
