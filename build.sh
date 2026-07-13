#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  FarmHealth — Build Script for Linux/Mac
#  ═══════════════════════════════════════════════════════════
#  Builds the www/ folder for web deployment AND syncs to
#  the Capacitor Android project for mobile app builds.
#
#  Usage:
#    ./build.sh              # Build web assets + copy to Android
#    ./build.sh --apk        # Build web assets + build APK
#    ./build.sh --deploy     # Full pipeline: build + APK + commit
#  ═══════════════════════════════════════════════════════════

set -e

echo ""
echo "  🛰️  FarmHealth — Build Script"
echo "  ─────────────────────────────"
echo ""

BUILD_DIR="www"

# Clean and recreate build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# ─── Copy Frontend Files ───
echo "📦 Copying frontend files..."
cp index.html "$BUILD_DIR/"
cp manifest.json "$BUILD_DIR/"
cp sw.js "$BUILD_DIR/"
cp -r css "$BUILD_DIR/css"
cp -r js "$BUILD_DIR/js"
cp -r assets "$BUILD_DIR/" 2>/dev/null || true

echo "  ✅ www/ built: $(ls -la www/index.html | awk '{print $5}') bytes"

# ─── Sync to Capacitor Android (optional) ───
if command -v npx &> /dev/null && [ -d "android" ]; then
  echo "📱 Syncing to Capacitor Android..."
  npx cap copy android
  echo "  ✅ Android project synced!"
fi

# ─── Build Android APK (optional, --apk flag) ───
if [ "$1" = "--apk" ] || [ "$1" = "--deploy" ]; then
  if [ -f "android/gradlew" ]; then
    echo "🔨 Building Android APK..."
    cd android
    ./gradlew assembleDebug
    cd ..
    APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
    if [ -f "$APK_PATH" ]; then
      echo "  ✅ APK built: $APK_PATH"
      ls -lh "$APK_PATH"
    fi
  fi
fi

# ─── Git commit (optional, --deploy flag) ───
if [ "$1" = "--deploy" ]; then
  echo "📤 Committing and pushing to GitHub..."
  git add -A
  git commit -m "Build: www + Android sync $(date +%Y-%m-%d)"
  git push origin main
  echo "  ✅ Pushed to GitHub!"
fi

echo ""
echo "  ✅ Build complete!"
echo "  📂 www/  — Web assets for static deploy"
if [ -f "android/app/build/outputs/apk/debug/app-debug.apk" ]; then
  echo "  📱 APK: android/app/build/outputs/apk/debug/app-debug.apk"
fi
echo ""
