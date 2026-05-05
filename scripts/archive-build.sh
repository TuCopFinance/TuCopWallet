#!/bin/bash
# Archive Android build with version and build number

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE_DIR="$PROJECT_ROOT/builds/android"
AAB_PATH="$PROJECT_ROOT/android/app/build/outputs/bundle/mainnetRelease/app-mainnet-release.aab"

# Get version info
VERSION=$(grep '"version"' "$PROJECT_ROOT/package.json" | head -1 | sed 's/.*: "\(.*\)".*/\1/')
BUILD_CODE=$(grep "VERSION_CODE" "$PROJECT_ROOT/android/gradle.properties" | cut -d'=' -f2)

# Create archive directory if not exists
mkdir -p "$ARCHIVE_DIR"

# Check if AAB exists
if [ ! -f "$AAB_PATH" ]; then
    echo "No AAB found at $AAB_PATH"
    echo "Run the build first: cd android && ENVFILE=.env.mainnet ./gradlew bundleMainnetRelease"
    exit 1
fi

# Archive filename
ARCHIVE_NAME="tucop-v${VERSION}-build${BUILD_CODE}.aab"
ARCHIVE_PATH="$ARCHIVE_DIR/$ARCHIVE_NAME"

# Copy to archive
cp "$AAB_PATH" "$ARCHIVE_PATH"

echo "✅ Build archived:"
echo "   Version: $VERSION"
echo "   Build:   $BUILD_CODE"
echo "   Path:    $ARCHIVE_PATH"
echo ""
echo "📁 All archived builds:"
ls -lh "$ARCHIVE_DIR"/*.aab 2>/dev/null | awk '{print "   " $NF " (" $5 ")"}'
