#!/usr/bin/env bash
# يطلع APK موقّع جاهز للتثبيت:  ./build-apk.sh
# المطلوب مرة وحدة قبل التشغيل (في الترمنال):
#   export ANDROID_HOME="$HOME/Android/Sdk"          # مسار Android SDK
#   export KEYSTORE="$HOME/stooorna-release.jks"     # ملف المفتاح (نفس المفتاح دائماً!)
#   export KS_PASS="كلمة_سر_المفتاح"
#   export KEY_ALIAS="stooorna"
set -euo pipefail
cd "$(dirname "$0")"

: "${ANDROID_HOME:?ضع ANDROID_HOME}"
: "${KEYSTORE:?ضع KEYSTORE}"
: "${KS_PASS:?ضع KS_PASS}"
KEY_ALIAS="${KEY_ALIAS:-stooorna}"

VER=$(node -p "require('./package.json').version")
GRADLE=android/app/build.gradle

# 1) رفع versionCode تلقائياً (لازم يزيد في كل نسخة وإلا الأندرويد يرفض التحديث)
CUR=$(grep -Eo 'versionCode [0-9]+' "$GRADLE" | grep -Eo '[0-9]+' | head -1)
NEW=$((CUR + 1))
sed -i.bak -E "s/versionCode [0-9]+/versionCode $NEW/; s/versionName \"[^\"]*\"/versionName \"$VER\"/" "$GRADLE"
rm -f "$GRADLE.bak"
echo "▶ versionName=$VER versionCode=$NEW"

# 2) بناء الويب ومزامنته مع مشروع الأندرويد
npm ci
npm run build
npx cap sync android

# 3) بناء الـ APK
( cd android && ./gradlew clean assembleRelease )

# 4) محاذاة + توقيع + تحقق
BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
UNSIGNED=$(ls android/app/build/outputs/apk/release/*-unsigned.apk 2>/dev/null | head -1 || true)
[ -n "$UNSIGNED" ] || UNSIGNED=$(ls android/app/build/outputs/apk/release/*.apk | head -1)
ALIGNED=$(mktemp -u).apk
OUT="Stooorna-$VER.apk"

"$BT/zipalign" -f -p 4 "$UNSIGNED" "$ALIGNED"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" --ks-pass env:KS_PASS --out "$OUT" "$ALIGNED"
"$BT/apksigner" verify --verbose "$OUT" | head -5

echo
echo "✅ جاهز: $(pwd)/$OUT"
echo "   ارفعه من إعدادات الموقع (Upload) أو ثبّته: adb install -r $OUT"
