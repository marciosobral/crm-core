#!/usr/bin/env bash
# Deploys the API on Render at COMMIT_SHA and waits until it is live.
# With --if-changed, it first compares COMMIT_SHA with the commit Render has live and
# skips the deploy when nothing the API depends on changed. Deciding against the live
# commit (not the previous push) means a failed earlier run never leaves an API change undeployed.
# The deploy is looked up by commit instead of read from the trigger response
# because Render answers 202 without a body when it queues behind another deploy.
set -euo pipefail

: "${RENDER_API_KEY:?}" "${RENDER_SERVICE_ID:?}" "${COMMIT_SHA:?}"

api="https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys"
auth=(-H "Authorization: Bearer ${RENDER_API_KEY}" -H "Accept: application/json")

if [[ "${1:-}" == "--if-changed" ]]; then
  live_commit=$(curl -fsS "${auth[@]}" "${api}?limit=20" |
    jq -r '[.[].deploy | select(.status == "live")][0].commit.id // empty') || live_commit=""
  if [[ -n "$live_commit" ]] &&
    git diff --quiet "$live_commit" "$COMMIT_SHA" -- \
      apps/api packages/contract pnpm-lock.yaml package.json pnpm-workspace.yaml .npmrc; then
    echo "API unchanged since live commit ${live_commit}; skipping the API deploy"
    exit 0
  fi
  echo "Deploying the API (live commit: ${live_commit:-unknown})"
fi

curl -fsS -X POST "${auth[@]}" -H "Content-Type: application/json" \
  -d "{\"commitId\":\"${COMMIT_SHA}\"}" "$api" > /dev/null

deadline=$((SECONDS + 1200))
while ((SECONDS < deadline)); do
  status=$(curl -fsS "${auth[@]}" "${api}?limit=20" |
    jq -r --arg sha "$COMMIT_SHA" '[.[].deploy | select(.commit.id == $sha)][0].status // "pending"') ||
    status="unknown"
  echo "Render deploy status: ${status}"
  case "$status" in
    live) exit 0 ;;
    build_failed | update_failed | pre_deploy_failed | canceled | deactivated) exit 1 ;;
  esac
  sleep 15
done

echo "Timed out waiting for the Render deploy"
exit 1
