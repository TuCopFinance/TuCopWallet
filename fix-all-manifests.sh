#!/bin/bash

# Fix all AndroidManifest.xml files by removing package attributes
echo "Fixing all AndroidManifest.xml files..."

# Find all AndroidManifest.xml files in node_modules and remove package attribute
find node_modules -name "AndroidManifest.xml" -path "*/android/*" 2>/dev/null | while read manifest; do
    if grep -q 'package="' "$manifest"; then
        # Extract package name for logging
        package_name=$(grep -o 'package="[^"]*"' "$manifest" | head -1)
        
        # Remove the package attribute
        sed -i.bak 's/package="[^"]*"//g' "$manifest"
        
        echo "✅ Fixed: $manifest ($package_name)"
    fi
done

echo "Done!"