#!/bin/bash
# Equivalente ao app-version.js para o build Swift (não exige Node.js).
set -euo pipefail
repo_root="$1"
fallback="$2"
release_version="${3:-}"
stable='^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
fallback_version() { printf '%s\n' "$fallback"; exit 0; }
if [[ -n "$release_version" ]]; then
    if [[ ! "$release_version" =~ $stable || "$release_version" == v* ]]; then
        echo 'Invalid release version' >&2
        exit 1
    fi
    printf '%s\n' "$release_version"
    exit 0
fi
[[ -e "$repo_root/.git" ]] || fallback_version
repo_git() { git --no-optional-locks -C "$repo_root" "$@"; }
tags="$(repo_git tag --merged HEAD --list 2>/dev/null)" || fallback_version
matches=()
while IFS= read -r tag; do
    [[ "$tag" =~ $stable ]] && matches+=(--match "$tag")
done <<< "$tags"
[[ ${#matches[@]} -gt 0 ]] || fallback_version
description="$(repo_git describe --tags --long --abbrev=7 "${matches[@]}" HEAD 2>/dev/null)" || fallback_version
pattern='^v?([0-9]+\.[0-9]+\.[0-9]+)-([0-9]+)-g([a-f0-9]+)$'
[[ "$description" =~ $pattern ]] || fallback_version
version="${BASH_REMATCH[1]}"
distance="${BASH_REMATCH[2]}"
commit_hash="${BASH_REMATCH[3]}"
metadata=''
if [[ "$distance" != 0 ]]; then metadata="$distance.g$commit_hash"; fi
status="$(repo_git status --porcelain --untracked-files=normal 2>/dev/null)" || fallback_version
if [[ -n "$status" ]]; then metadata="${metadata:+$metadata.}dirty"; fi
if [[ -n "$metadata" ]]; then version="$version+$metadata"; fi
printf '%s\n' "$version"
