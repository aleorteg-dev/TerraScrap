#!/usr/bin/env bash
# Trivy image scan for TerraScrap images.
# CRITICAL findings → exit 1 (blocks CI).  HIGH findings → logged, no exit.
# Usage: bash docker/scan.sh [backend-image] [frontend-image]
# Defaults: terrascrap-backend:latest  terrascrap-frontend:latest
set -euo pipefail

BACKEND_IMAGE="${1:-terrascrap-backend:latest}"
FRONTEND_IMAGE="${2:-terrascrap-frontend:latest}"
TRIVY_SEVERITY_BLOCK="${TRIVY_SEVERITY_BLOCK:-CRITICAL}"
TRIVY_SEVERITY_LOG="${TRIVY_SEVERITY_LOG:-HIGH}"

if ! command -v trivy &>/dev/null; then
    echo "WARN: trivy not found — skipping image scan."
    echo "      Install: https://github.com/aquasecurity/trivy#installation"
    exit 0
fi

echo "==> trivy version: $(trivy --version | head -1)"

scan_image() {
    local image="$1"
    local label="$2"
    echo ""
    echo "==> Scanning $label ($image) for $TRIVY_SEVERITY_BLOCK vulns..."
    if trivy image \
        --severity "$TRIVY_SEVERITY_BLOCK" \
        --exit-code 1 \
        --no-progress \
        "$image"; then
        echo "     OK — no $TRIVY_SEVERITY_BLOCK vulnerabilities."
    else
        echo "FAIL: $TRIVY_SEVERITY_BLOCK vulnerability found in $label. Blocking."
        return 1
    fi

    echo ""
    echo "==> Scanning $label ($image) for $TRIVY_SEVERITY_LOG vulns (log only)..."
    trivy image \
        --severity "$TRIVY_SEVERITY_LOG" \
        --exit-code 0 \
        --no-progress \
        "$image" || true
}

scan_image "$BACKEND_IMAGE" "backend"
scan_image "$FRONTEND_IMAGE" "frontend"

echo ""
echo "Scan complete."
