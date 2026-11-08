#!/usr/bin/env bash
# Build the program as sBPFv3 with the Solana 4.3.0 tools.
#
# Do NOT use `anchor build` for this. In practice it switched the active Solana
# install back to 2.3.0 and then built with the old tools, producing a file
# labelled v3 that the 4.3.0 CLI rejected ("invalid file header"). (That is an
# inference from what we observed, not something confirmed in Anchor's source.)
set -euo pipefail
SOL="$HOME/.local/share/solana/install"
if [ ! -d "$SOL/releases/4.3.0/solana-release" ]; then
  echo "Solana 4.3.0 is not installed under $SOL/releases"; exit 1
fi
ln -sfn "$SOL/releases/4.3.0/solana-release" "$SOL/active_release"
hash -r 2>/dev/null || true
v="$(solana --version)"; echo "$v"
case "$v" in *4.3.0*) ;; *) echo "Expected Solana 4.3.0 - aborting."; exit 1;; esac
cd "$(dirname "$0")/../programs/ethos_escrow"
cargo build-sbf --arch v3
cd ../..
echo "--- result ---"
readelf -h target/deploy/ethos_escrow.so | grep -E "Machine|Flags"
ls -l target/deploy/ethos_escrow.so
sha256sum target/deploy/ethos_escrow.so
echo "(Machine must say 'Linux BPF' and Flags '0x3, CPU Version: 3'.)"
