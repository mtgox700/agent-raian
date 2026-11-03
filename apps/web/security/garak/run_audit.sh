#!/usr/bin/env bash
# Phantera — LLM security red-team with NVIDIA garak.
#
# Prereqs:
#   1. python -m venv .venv && source .venv/bin/activate && pip install garak
#   2. Run the app with the red-team endpoint enabled + a real LLM:
#        ENABLE_REDTEAM=1 OLLAMA_API_KEY=... npm run dev   (in apps/web)
#      (optionally set REDTEAM_SECRET and put it in phantera-redteam.json)
#
# Usage: bash run_audit.sh [report_prefix]
set -euo pipefail
cd "$(dirname "$0")"

PREFIX="${1:-phantera_audit}"
CONFIG="phantera-redteam.json"

# Prioritized probes for an outbound-email classifier (untrusted prospect text):
#   promptinject     — classic jailbreaks / instruction hijacks
#   latentinjection  — payload hidden in supplied content (the real risk here:
#                      a malicious reply trying to override classification)
#   dan              — Do-Anything-Now personas (watch FR false positives)
PROBES="${GARAK_PROBES:-promptinject,latentinjection,dan}"

echo "▶ garak scan: probes=$PROBES → endpoint in $CONFIG"
python -m garak \
  --model_type rest \
  --generator_option_file "$CONFIG" \
  --probes "$PROBES" \
  --generations "${GARAK_GENERATIONS:-1}" \
  --report_prefix "$PREFIX"

echo "▶ analyzing report…"
python analyze_report.py
