#!/bin/sh

set -e

echo "🔧 CI Post Clone Script"
echo "Working directory: $(pwd)"

# Ensure we have the latest CocoaPods
echo "📦 Updating CocoaPods..."
gem install cocoapods --no-document || true

# Install CocoaPods dependencies
echo "📦 Installing CocoaPods dependencies..."
cd ios
pod install --repo-update

# Strip bitcode from problematic frameworks
echo "🔧 Stripping bitcode from frameworks..."
chmod +x fix_bitcode_ios.sh
./fix_bitcode_ios.sh

# Verify frameworks are bitcode-free
echo "🔍 Verifying bitcode removal..."
if otool -l Pods/PersonaInquirySDK2/Persona2.xcframework/ios-arm64/Persona2.framework/Persona2 | grep -q "__LLVM"; then
    echo "❌ ERROR: Persona2 still contains bitcode!"
    exit 1
fi

if otool -l Pods/OpenSSL-Universal/Frameworks/OpenSSL.xcframework/ios-arm64_armv7/OpenSSL.framework/OpenSSL | grep -q "__LLVM"; then
    echo "❌ ERROR: OpenSSL still contains bitcode!"
    exit 1
fi

echo "✅ Post clone setup complete - frameworks are bitcode-free"
