#!/bin/bash

# Fix AndroidManifest.xml files by removing package attribute
echo "Fixing AndroidManifest.xml files..."

# react-native-adjust
manifest1="./node_modules/react-native-adjust/android/src/main/AndroidManifest.xml"
if [ -f "$manifest1" ]; then
    sed -i.bak 's/package="com.adjust.nativemodule"//' "$manifest1"
    echo "✅ Fixed react-native-adjust manifest"
fi

# react-native-cookies
manifest2="./node_modules/@react-native-cookies/cookies/android/src/main/AndroidManifest.xml"
if [ -f "$manifest2" ]; then
    sed -i.bak 's/package="com.reactnativecommunity.cookies"//' "$manifest2"
    echo "✅ Fixed react-native-cookies manifest"
fi

echo "Done!"