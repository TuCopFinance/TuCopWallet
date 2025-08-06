const fs = require('fs')
const path = require('path')

function fixBuildConfig(directory) {
  const buildGradleFiles = []

  // Find all build.gradle files
  function findBuildGradleFiles(dir) {
    try {
      const files = fs.readdirSync(dir)

      for (const file of files) {
        const fullPath = path.join(dir, file)
        const stat = fs.statSync(fullPath)

        if (stat.isDirectory() && !file.startsWith('.')) {
          findBuildGradleFiles(fullPath)
        } else if (file === 'build.gradle' && dir.includes('/android')) {
          buildGradleFiles.push(fullPath)
        }
      }
    } catch (err) {
      // Ignore permission errors
    }
  }

  findBuildGradleFiles(directory)

  let fixedCount = 0

  for (const gradleFile of buildGradleFiles) {
    try {
      let content = fs.readFileSync(gradleFile, 'utf8')

      // Check if it uses buildConfigField
      if (content.includes('buildConfigField') && !content.includes('buildFeatures')) {
        // Find the android { block
        const androidBlockMatch = content.match(/android\s*\{([^}]*)\}/s)

        if (androidBlockMatch) {
          const androidBlock = androidBlockMatch[1]

          // Add buildFeatures if not present
          if (!androidBlock.includes('buildFeatures')) {
            const newAndroidBlock = androidBlock.replace(
              /(namespace[^\n]*\n)?(\s*)(compileSdkVersion|compileSdk)/,
              `$1$2buildFeatures {\n$2    buildConfig true\n$2}\n$2$3`
            )

            content = content.replace(androidBlockMatch[0], `android {${newAndroidBlock}}`)
            fs.writeFileSync(gradleFile, content)
            console.log(`✅ Fixed BuildConfig in: ${gradleFile.replace(directory, '.')}`)
            fixedCount++
          }
        }
      }
    } catch (err) {
      console.log(`⚠️ Error processing ${gradleFile}: ${err.message}`)
    }
  }

  console.log(`\n✅ Fixed ${fixedCount} BuildConfig issues!`)
}

// Run the fix
fixBuildConfig(path.join(__dirname, 'node_modules'))
