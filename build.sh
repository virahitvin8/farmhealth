#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  FarmHealth — Build script for Linux/Mac
#  ═══════════════════════════════════════════════════════════
#  Bundles the app files into a www/ directory for deployment
#  ═══════════════════════════════════════════════════════════

set -e

echo ""
echo "  🛰️  FarmHealth — Build Script"
echo "  ─────────────────────────────"
echo ""

BUILD_DIR="www"

# Clean build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
mkdir -p "$BUILD_DIR/css"
mkdir -p "$BUILD_DIR/js"
mkdir -p "$BUILD_DIR/server"

# Copy frontend files
echo "📦 Copying frontend files..."
cp index.html "$BUILD_DIR/"
cp manifest.json "$BUILD_DIR/"
cp sw.js "$BUILD_DIR/"
cp -r css/*.css "$BUILD_DIR/css/" 2>/dev/null || true
cp -r js/*.js "$BUILD_DIR/js/" 2>/dev/null || true

# Copy server files
echo "📦 Copying server files..."
cp -r server/server.js "$BUILD_DIR/server/"
cp server/package.json "$BUILD_DIR/server/"

# Copy Docker configuration
echo "📦 Copying deployment files..."
cp Dockerfile "$BUILD_DIR/" 2>/dev/null || true
cp .dockerignore "$BUILD_DIR/" 2>/dev/null || true

# Install server dependencies
echo "📦 Installing server dependencies..."
cd "$BUILD_DIR/server"
npm install --omit=dev 2>/dev/null
cd ../..

echo ""
echo "  ✅ Build complete! Files in www/ directory"
echo "  📂 $(pwd)/$BUILD_DIR"
echo ""
echo "  🚀 To run locally:"
echo "     node server/server.js"
echo "     Then open http://localhost:3001"
echo ""
