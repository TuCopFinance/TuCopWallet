#!/bin/sh

set -e

echo "🔧 CI Pre Xcodebuild Script"

# Ensure we're using automatic signing
echo "📝 Configuring code signing..."

# Set the correct signing for Xcode Cloud
defaults write com.apple.dt.Xcode IDEPackageSupportUseBuiltinSCM YES

echo "✅ Pre xcodebuild setup complete"
