#!/usr/bin/env bash
set -euo pipefail

destination="android/app/src/main/assets/custom/"

mkdir -p "$destination"
rsync -avyz src/account/LicenseDisclaimer.txt "$destination"
