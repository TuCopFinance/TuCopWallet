const fs = require('fs')
const path = require('path')

function findAndFixNamespaces(directory) {
  const buildGradleFiles = []

  // Find all build.gradle files in node_modules
  function findBuildGradleFiles(dir) {
    try {
      const files = fs.readdirSync(dir)

      for (const file of files) {
        const fullPath = path.join(dir, file)
        const stat = fs.statSync(fullPath)

        if (stat.isDirectory() && !file.startsWith('.') && file !== 'test' && file !== 'tests') {
          // Only go into android directories
          if (file === 'android' || dir.includes('/android/')) {
            findBuildGradleFiles(fullPath)
          } else if (dir.includes('node_modules') && !dir.includes('/android')) {
            // For node_modules, check if android folder exists
            const androidPath = path.join(fullPath, 'android')
            if (fs.existsSync(androidPath)) {
              findBuildGradleFiles(androidPath)
            }
          }
        } else if (file === 'build.gradle' && dir.includes('/android')) {
          buildGradleFiles.push(fullPath)
        }
      }
    } catch (err) {
      // Ignore permission errors
    }
  }

  findBuildGradleFiles(directory)

  console.log(`Found ${buildGradleFiles.length} build.gradle files to check`)

  let fixedCount = 0

  for (const gradleFile of buildGradleFiles) {
    try {
      let content = fs.readFileSync(gradleFile, 'utf8')

      // Skip if namespace already exists
      if (content.includes('namespace ')) {
        continue
      }

      // Skip if it's not an Android library module
      if (!content.includes("apply plugin: 'com.android.library'")) {
        continue
      }

      // Find the android { block
      const androidBlockRegex = /android\s*\{/
      if (androidBlockRegex.test(content)) {
        // Extract package name from the path or AndroidManifest.xml
        let namespace = ''

        // Try to find AndroidManifest.xml in the same directory
        const manifestPath = path.join(path.dirname(gradleFile), 'src/main/AndroidManifest.xml')
        if (fs.existsSync(manifestPath)) {
          const manifestContent = fs.readFileSync(manifestPath, 'utf8')
          const packageMatch = manifestContent.match(/package="([^"]+)"/)
          if (packageMatch) {
            namespace = packageMatch[1]
          }
        }

        // If no manifest or package found, derive from path
        if (!namespace) {
          const pathParts = gradleFile.split('/')
          const moduleIndex = pathParts.findIndex((p) => p === 'node_modules')
          if (moduleIndex !== -1 && moduleIndex < pathParts.length - 1) {
            const moduleName = pathParts[moduleIndex + 1]
            if (moduleName.startsWith('@')) {
              // Scoped package
              namespace = 'com.' + pathParts[moduleIndex + 2].replace(/-/g, '')
            } else {
              namespace = 'com.' + moduleName.replace(/react-native-/g, '').replace(/-/g, '')
            }
          }
        }

        if (namespace) {
          content = content.replace(androidBlockRegex, `android {\n  namespace "${namespace}"`)
          fs.writeFileSync(gradleFile, content)
          console.log(`✅ Fixed: ${gradleFile.replace(directory, '.')} -> ${namespace}`)
          fixedCount++
        }
      }
    } catch (err) {
      console.log(`⚠️ Error processing ${gradleFile}: ${err.message}`)
    }
  }

  console.log(`\n✅ Fixed ${fixedCount} namespace issues!`)
}

// Run the fix
findAndFixNamespaces(path.join(__dirname, 'node_modules'))
