#!/bin/bash

# Android Gradle Fix Script
# This script fixes Android Gradle Plugin 8.x compatibility issues in node_modules
# Run automatically after yarn/npm install

echo "🔧 Fixing Android Gradle compatibility issues..."

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$BASE_DIR"

# Fix namespaces in build.gradle files
echo "Adding missing namespaces..."
find node_modules -name "build.gradle" \( -path "*/android/build.gradle" -o -path "*/src/android/build.gradle" \) 2>/dev/null | while read gradle_file; do
    if [ -f "$gradle_file" ] && ! grep -q "namespace" "$gradle_file"; then
        pkg_dir=$(dirname $(dirname "$gradle_file"))
        manifest=$(find "$pkg_dir" -name "AndroidManifest.xml" 2>/dev/null | head -1)
        
        if [ -n "$manifest" ] && [ -f "$manifest" ]; then
            namespace=$(grep "package=" "$manifest" | head -1 | sed 's/.*package="\([^"]*\)".*/\1/')
            
            if [ -n "$namespace" ] && grep -q "^android {" "$gradle_file"; then
                pkg_name=$(echo "$gradle_file" | sed 's|.*/node_modules/||' | sed 's|/.*||')
                perl -i.bak -pe 's/(^android \{)/$1\n    namespace "'"$namespace"'"/' "$gradle_file"
                rm -f "${gradle_file}.bak"
            fi
        fi
    fi
done

# Add buildFeatures.buildConfig true to files with buildConfigField
echo "Adding buildFeatures.buildConfig..."
find node_modules -name "build.gradle" \( -path "*/android/build.gradle" -o -path "*/src/android/build.gradle" \) 2>/dev/null | while read gradle_file; do
    if [ -f "$gradle_file" ] && grep -q "buildConfigField" "$gradle_file" && ! grep -q "buildFeatures" "$gradle_file"; then
        if grep -q "namespace" "$gradle_file"; then
            perl -i.bak -pe 's/(namespace ".*")/$1\n\n    buildFeatures {\n        buildConfig true\n    }/' "$gradle_file"
        else
            perl -i.bak -pe 's/(compileSdkVersion .*)/$1\n\n    buildFeatures {\n        buildConfig true\n    }/' "$gradle_file"
        fi
        rm -f "${gradle_file}.bak"
    fi
done

# Remove package attributes from AndroidManifest.xml files
echo "Removing package attributes from AndroidManifest.xml..."
find node_modules -name "AndroidManifest.xml" 2>/dev/null | while read manifest; do
    if grep -q "package=" "$manifest"; then
        sed -i.bak 's/package="[^"]*"//g' "$manifest"
        rm -f "${manifest}.bak"
    fi
done

# Fix specific packages
echo "Applying package-specific fixes..."

# Fix react-native-contacts namespace
if [ -f "node_modules/react-native-contacts/android/build.gradle" ]; then
    sed -i.bak 's/namespace "com.example"/namespace "com.rt2zz.reactnativecontacts"/' node_modules/react-native-contacts/android/build.gradle
    rm -f node_modules/react-native-contacts/android/build.gradle.bak
fi

# Fix detox namespace
if [ -f "node_modules/detox/android/detox/build.gradle" ]; then
    perl -i.bak -pe 's/def agpVersion.*?if \(agpVersion >= 7\) \{.*?namespace "com.wix.detox".*?\}/namespace "com.wix.detox"/s' node_modules/detox/android/detox/build.gradle
    rm -f node_modules/detox/android/detox/build.gradle.bak
fi

echo "✅ Android Gradle fixes applied successfully!"
