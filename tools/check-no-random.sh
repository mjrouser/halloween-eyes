#!/usr/bin/env bash
# Fails if Math.random() appears in show logic.
#
# Both browser windows compute the show independently from the wall clock, so a
# single random call desynchronizes them. All variation must come from hashing a
# time-slot index instead — see public/js/rng.js and DESIGN.md section 4.3.
#
# Comments are stripped before matching, so prose explaining the rule (including
# the paragraph above) does not trip it. Only real code counts.
set -euo pipefail

cd "$(dirname "$0")/.."

strip_comments() {
  awk '
    { line = $0 }
    # Inside a block comment: look for the close, drop everything up to it.
    in_block {
      idx = index(line, "*/")
      if (idx == 0) { next }
      line = substr(line, idx + 2)
      in_block = 0
    }
    {
      # Remove any complete /* ... */ spans on this line.
      while ((s = index(line, "/*")) > 0) {
        rest = substr(line, s + 2)
        e = index(rest, "*/")
        if (e == 0) { line = substr(line, 1, s - 1); in_block = 1; break }
        line = substr(line, 1, s - 1) substr(rest, e + 2)
      }
      # Remove a // line comment.
      if ((s = index(line, "//")) > 0) { line = substr(line, 1, s - 1) }
      print FILENAME ":" FNR ":" line
    }
  ' "$1"
}

HITS=""
while IFS= read -r f; do
  found=$(strip_comments "$f" | grep 'Math\.random' || true)
  [ -n "$found" ] && HITS="${HITS}${found}"$'\n'
done < <(find public/js -name '*.js' -type f | sort)

if [ -n "${HITS//[$'\n']/}" ]; then
  echo "ERROR: Math.random() found in show logic." >&2
  printf '%s' "$HITS" >&2
  echo "Use rng.js (hash of a time slot) instead — see DESIGN.md section 4.3." >&2
  exit 1
fi

echo "OK: no Math.random() in show logic."
