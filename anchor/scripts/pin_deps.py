#!/usr/bin/env python3
"""Pin Cargo.lock to crate versions the Solana SBF compiler can build.

Why: Solana's platform-tools ship a Rust 1.84-based compiler. It cannot read
edition-2024 manifests or compile crates that require a newer Rust. This lowers
only the offending locked versions, using crates.io's per-version edition and
rust-version data. It edits Cargo.lock only, never source code.

Run from the anchor/ directory (needs a modern host cargo for `cargo metadata`).
Safe to re-run. Commit the resulting Cargo.lock so builds are reproducible.
If a crate cannot be fixed because a parent requires it, the script says so and
prints the dependency chain; pin the parent crate instead.
"""
import json, os, subprocess, sys, urllib.request

os.environ["CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS"] = "fallback"
MAX_RUST = (1, 84, 1)  # rustc shipped with the Solana SBF tools


def sh(*a):
    return subprocess.run(a, capture_output=True, text=True)


def key(v):
    return tuple(int(x) if x.isdigit() else 0 for x in str(v).split("-")[0].split("+")[0].split("."))


def too_new(p):
    rv = p.get("rust_version")
    return p["edition"] == "2024" or (rv and key(rv) > MAX_RUST)


def offenders():
    r = sh("cargo", "metadata", "--format-version", "1")
    if r.returncode:
        print("cargo metadata failed (often a network drop - just re-run):\n" + r.stderr[-1200:])
        sys.exit(1)
    d = json.loads(r.stdout)
    return sorted({(p["name"], p["version"]) for p in d["packages"] if too_new(p)})


def versions(name):
    req = urllib.request.Request("https://crates.io/api/v1/crates/" + name, headers={"User-Agent": "ethos-pin/1.0"})
    return json.load(urllib.request.urlopen(req))["versions"]


def usable(v):
    return (not v["yanked"] and "-" not in v["num"] and v.get("edition") != "2024"
            and (not v.get("rust_version") or key(v["rust_version"]) <= MAX_RUST))


def candidates(name, ver):
    return sorted((v["num"] for v in versions(name) if usable(v) and key(v["num"]) < key(ver)), key=key, reverse=True)


if __name__ == "__main__":
    failed = set()
    for _ in range(80):
        bad = [b for b in offenders() if b not in failed]
        if not bad:
            break
        name, ver = bad[0]
        for c in candidates(name, ver)[:6]:
            if sh("cargo", "update", "-p", name + "@" + ver, "--precise", c).returncode == 0:
                print("pinned", name, ver, "->", c)
                break
        else:
            print("skipping for now:", name, ver, "(a parent crate likely needs it)")
            failed.add((name, ver))
    left = offenders()
    if not left:
        print("DONE: nothing left that needs a newer Rust than 1.84.")
    else:
        print("STILL NEED FIXING:")
        for n, v in left:
            print("  ", n, v)
            print(sh("cargo", "tree", "-i", n + "@" + v, "--depth", "3").stdout)
        sys.exit(1)
