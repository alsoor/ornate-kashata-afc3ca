#!/bin/bash
# شغّله من جذر المشروع. يعدّل فقط، ما يحذف شي، ويمكن تشغيله أكثر من مرة.
# env(safe-area-inset-X) -> max(env(safe-area-inset-X, 0px), var(--safe-area-inset-X, 0px))
grep -rlE "env\(safe-area-inset-(top|bottom|left|right)" src --include=*.tsx --include=*.ts --include=*.css | while read f; do
  perl -0pi -e 's/env\(safe-area-inset-(top|bottom|left|right)\s*(?:,\s*0px)?\)(?!\s*,\s*var\(--safe-area)/max(env(safe-area-inset-$1, 0px), var(--safe-area-inset-$1, 0px))/g' "$f"
  echo "updated $f"
done
