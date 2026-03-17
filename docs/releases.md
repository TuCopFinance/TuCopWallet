# Releases - TuCOP Wallet

The CI/CD pipeline handles releases for TuCOP Wallet. iOS is automated via TestFlight and Android requires uploading to Play Store.

## Android - (internal testers)

Android builds can be manually released by running the CI workflow, downloading the bundle from GitHub, and uploading to the Play Store.

1. Run the release workflow against the `main` branch
2. Download and unzip the Android bundle from the build artifacts
3. Navigate to Internal Testing on the Google Play Console and click `Create new release`. Upload the app bundle and click `Next`, then `Save and Publish`.
4. Internal testers should be able to download the latest version on their Android devices.

## iOS - (TestFlight)

iOS builds are released via TestFlight after running the release workflow.

1. Run the release workflow against the `main` branch
2. TestFlight users will automatically receive the latest build on their iOS devices.

## Quick Release

```bash
# 1. Bump version
yarn version --patch

# 2. Push (triggers CI/CD automatically)
git push origin main --follow-tags
```

See [release-process.md](release-process.md) and [ci-cd.md](ci-cd.md) for detailed release procedures.
