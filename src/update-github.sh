#!/usr/bin/env bash
# تحديث Page / Server / Lib / Layouts / Components ورفعها على GitHub
# الاستخدام من جذر المشروع:
#   ./update-github.sh
#   ./update-github.sh "رسالة الكوميت"

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "خطأ: هذا المجلد ليس مستودع Git. شغّل السكربت من جذر المشروع."
  exit 1
fi

# الأسماء الشائعة لنفس المجلدات في Next.js ومشاريع مشابهة
DIRS=(
  page
  pages
  Page
  Pages
  server
  Server
  lib
  Lib
  layouts
  Layouts
  components
  Components
  app
  src
  src/app
  src/pages
  src/server
  src/lib
  src/layouts
  src/components
)

FOUND=0
for d in "${DIRS[@]}"; do
  if [ -d "$d" ]; then
    git add -A "$d"
    FOUND=1
    echo "تمت إضافة: $d"
  fi
done

if [ "$FOUND" -eq 0 ]; then
  echo "ما لقيت أي مجلد من: page pages server lib layouts components app src"
  echo "تأكد إنك داخل جذر المشروع، أو عدّل قائمة DIRS داخل السكربت."
  exit 1
fi

if git diff --cached --quiet; then
  echo "ما فيه تغييرات جديدة للرفع."
  exit 0
fi

MSG="${1:-update: page server lib layouts components}"
git commit -m "$MSG"
git push
echo "تم التحديث على GitHub."
