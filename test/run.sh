#!/bin/bash
# Runs the Heirloom drive scripts against a server the caller already started on 8814.
# usage: bash test/run.sh [script-number ...]   (no arguments runs all of them)
cd /Users/sherry/Documents/DEVPROJECTS
D=/Users/sherry/Documents/DEVPROJECTS/heirloom/test
list="${@:-01-firstrun 02-upgrade 03-back-lifecycle 04-io 05-edges 06-notify 07-safe-areas 08-endurance 09-review 10-doubletap 11-contrast 12-widest}"
fail=0
for t in $list; do
  echo "##### $t"
  node _shiptools/drive.js http://127.0.0.1:8814/ "$D/$t.js" --out "$D/shots" 2>&1 | grep -Ev "^  shot " | tail -"${TAIL:-24}"
  [ "${PIPESTATUS[0]}" = 0 ] || fail=1
done
[ $fail = 0 ] && echo "ALL CLEAN" || echo "SOME FAILED"
exit $fail
