#!/bin/bash

# Find all build.gradle files in node_modules that need namespace
echo "Searching for build.gradle files without namespace..."

find node_modules -name "build.gradle" -path "*/android/*" 2>/dev/null | while read file; do
    # Check if file contains android library plugin and doesn't have namespace
    if grep -q "apply plugin: 'com.android.library'" "$file" && ! grep -q "namespace " "$file"; then
        echo "Processing: $file"
        
        # Try to find package name from AndroidManifest.xml
        manifest_dir=$(dirname "$file")/src/main
        manifest_file="$manifest_dir/AndroidManifest.xml"
        
        if [ -f "$manifest_file" ]; then
            package_name=$(grep -o 'package="[^"]*"' "$manifest_file" | sed 's/package="//' | sed 's/"//')
            if [ ! -z "$package_name" ]; then
                echo "  Found package: $package_name"
                # Add namespace after android { line
                sed -i.bak '/android {/a\
  namespace "'"$package_name"'"' "$file"
                echo "  ✅ Fixed!"
            fi
        else
            # Try to derive from path
            module_name=$(echo "$file" | sed 's/.*node_modules\///' | sed 's/\/android.*//')
            namespace="com.$(echo $module_name | sed 's/@//' | sed 's/\//./' | sed 's/-//g')"
            echo "  Derived namespace: $namespace"
            sed -i.bak '/android {/a\
  namespace "'"$namespace"'"' "$file"
            echo "  ✅ Fixed!"
        fi
    fi
done

echo "Done!"