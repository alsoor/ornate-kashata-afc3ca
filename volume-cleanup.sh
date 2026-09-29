#!/bin/sh
# Volume check/cleanup for Railway. Run inside the container (railway ssh).
#   sh volume-cleanup.sh /path/to/volume            -> report only, deletes nothing
#   sh volume-cleanup.sh /path/to/volume --apply    -> deletes old temp files only
# Only touches: */tmp/*, */cache/*, */.cache/*, *.log, *.tmp older than DAYS (default 7).
# Never touches user uploads (images/videos/audio).
VOL="$1"; MODE="$2"; DAYS="${DAYS:-7}"
if [ -z "$VOL" ] || [ ! -d "$VOL" ]; then
  echo "Usage: sh volume-cleanup.sh /path/to/volume [--apply]"; exit 1
fi
echo "== df =="; df -h "$VOL"
echo; echo "== Biggest folders =="; du -sk "$VOL"/* 2>/dev/null | sort -rn | head -15 | awk '{printf "%8.1f MB  %s\n", $1/1024, $2}'
echo; echo "== Biggest files (>5MB) =="
find "$VOL" -type f -size +5120k -exec ls -l {} \; 2>/dev/null | awk '{printf "%8.1f MB  %s\n", $5/1048576, $9}' | sort -rn | head -15
echo; echo "== Temp files older than $DAYS days =="
CAND="$(find "$VOL" -type f \( -path '*/tmp/*' -o -path '*/cache/*' -o -path '*/.cache/*' -o -name '*.log' -o -name '*.tmp' \) -mtime +"$DAYS" 2>/dev/null)"
if [ -z "$CAND" ]; then echo "none"; else echo "$CAND" | head -50; echo "count: $(echo "$CAND" | wc -l)"; fi
if [ "$MODE" = "--apply" ] && [ -n "$CAND" ]; then
  echo; echo "== Deleting =="; echo "$CAND" | while IFS= read -r f; do rm -f -- "$f" && echo "deleted: $f"; done
  echo; df -h "$VOL"
elif [ -n "$CAND" ]; then
  echo; echo "(report only - add --apply to delete)"
fi
