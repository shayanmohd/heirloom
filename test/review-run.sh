#!/bin/bash
# Runs the reviewer's drive scripts against a server the caller already started on 8914.
# usage: bash test/review-run.sh [name ...]   (no arguments runs all of them)
cd /Users/sherry/Documents/DEVPROJECTS
D=/Users/sherry/Documents/DEVPROJECTS/heirloom/test
list="${@:-review-01-firstrun review-02-upgrade review-03-back review-04-safe review-05-contrast review-06-edges review-07-notify review-08-stress review-09-store review-10-states}"
fail=0
for t in $list; do
  echo "##### $t"
  node _shiptools/drive.js http://127.0.0.1:8914/ "$D/$t.js" --out "$D/shots/review" 2>&1 | grep -Ev "^  shot " | tail -"${TAIL:-14}"
  [ "${PIPESTATUS[0]}" = 0 ] || fail=1
done
[ $fail = 0 ] && echo "ALL CLEAN" || echo "SOME FAILED"
exit $fail
