#!/usr/bin/env bash
set -euo pipefail

mode="${1:?expected load, save-refresh, or save-liquipedia}"
runtime="${RUNNER_TEMP:-/tmp}/strikesignal-private-sync"
checkout="$runtime/data"
ssh_command="ssh -i $runtime/deploy_key -o IdentitiesOnly=yes -o UserKnownHostsFile=$runtime/known_hosts -o StrictHostKeyChecking=yes"

if [ "$mode" = load ]; then
  : "${PRIVATE_DATA_DEPLOY_KEY:?private data deploy key is required}"
  install -d -m 700 "$runtime"
  printf '%s\n' "$PRIVATE_DATA_DEPLOY_KEY" > "$runtime/deploy_key"
  chmod 600 "$runtime/deploy_key"
  cat > "$runtime/known_hosts" <<'EOF'
github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
EOF
  GIT_SSH_COMMAND="$ssh_command" git clone --quiet --depth 1 \
    git@github.com:optimelv/cs2-predictor-private-data.git "$checkout"
  cp -a "$checkout/models/." models/
  cp "$checkout/model-registry.internal.json" docs/data/model-registry.json
  echo 'Private data loaded.'
  exit 0
fi

if [ ! -d "$checkout/.git" ] || [ ! -s "$runtime/deploy_key" ]; then
  echo 'Private data checkout is missing.' >&2
  exit 1
fi

case "$mode" in
  save-refresh)
    cp -a models/. "$checkout/models/"
    cp docs/data/model-registry.json "$checkout/model-registry.internal.json"
    git -C "$checkout" add models model-registry.internal.json
    ;;
  save-liquipedia)
    for name in liquipedia-gap-queue.json liquipedia-gap-state.json liquipedia-observed-results.jsonl; do
      cp "models/$name" "$checkout/models/$name"
    done
    git -C "$checkout" add models/liquipedia-gap-queue.json models/liquipedia-gap-state.json models/liquipedia-observed-results.jsonl
    ;;
  *) echo "Unknown mode: $mode" >&2; exit 2 ;;
esac

if git -C "$checkout" diff --cached --quiet; then
  echo 'Private data unchanged.'
  exit 0
fi
git -C "$checkout" config user.name 'github-actions[bot]'
git -C "$checkout" config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git -C "$checkout" commit --quiet -m "Update private StrikeSignal data ($mode)"
# The data publishers share one workflow concurrency group. A non-fast-forward
# push must fail instead of rebasing a checkout with newly generated files.
GIT_SSH_COMMAND="$ssh_command" git -C "$checkout" push --quiet origin main
echo 'Private data saved.'
