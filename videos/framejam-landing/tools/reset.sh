#!/bin/zsh
# Fresh isolated Frame Jam on :4600 with the staged reviews. Leaves the server running in the background.
set -e
cd "${0:A:h}/../../.."
pkill -f "dist/server/cli.js --port 4600" || true
sleep 0.5
rm -rf /tmp/fj-film
STAGE=videos/framejam-landing/stage/ledgerly
rm -rf $STAGE/composition && cp -r $STAGE/composition-v1 $STAGE/composition
FRAMEJAM_HOME=/tmp/fj-film nohup node dist/server/cli.js --port 4600 > /tmp/fj-film.log 2>&1 &
for i in {1..40}; do curl -sf localhost:4600/api/reviews > /dev/null && break; sleep 0.25; done
npx tsx videos/framejam-landing/tools/agent.ts seed
