#!/usr/bin/env bash
# Builds e2e/fixtures/scanner-vod.webm, the VoD the scanner e2e tests scan: one
# game stitched from two hand-labeled fixture frames of the same match (the
# Undertow Spillway intro, then its results screen), separated by black. The
# tests assert against those fixtures' expected.json values. Also builds
# e2e/fixtures/scanner-coach-vod.webm, the coach mode tests' blank video.
#
# Usage: scripts/scanner/build-e2e-vod.sh (needs ffmpeg with libvpx-vp9)
set -euo pipefail

FIXTURES=app/features/scanner/tests/fixtures
OUT=e2e/fixtures/scanner-vod.webm
FPS=10

black() {
	echo "-f lavfi -t $1 -i color=c=black:s=1920x1080:r=$FPS"
}

still() {
	echo "-loop 1 -framerate $FPS -t $1 -i $2"
}

# VP9 rather than H.264: Playwright's Chromium may ship without proprietary codecs
# shellcheck disable=SC2046
ffmpeg -y -loglevel error \
	$(black 3) \
	$(still 6 "$FIXTURES/map-start/splat-zones-undertow-spillway/frame.png") \
	$(black 6) \
	$(still 8 "$FIXTURES/scoreboard/private-battle-splat-zones-ko-kera-2/frame.png") \
	-filter_complex "[1:v]scale=1920:1080,setsar=1[intro];[3:v]scale=1920:1080,setsar=1[results];[0:v][intro][2:v][results]concat=n=4:v=1:a=0,format=yuv420p[out]" \
	-map "[out]" -c:v libvpx-vp9 -crf 32 -b:v 0 -g $((FPS * 4)) -row-mt 1 \
	-deadline good -cpu-used 4 "$OUT"

echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"

# The coach mode e2e tests seed e2e/fixtures/scanner-coach-events.json as the
# scan of this file instead of scanning it, so only its length matters
COACH_OUT=e2e/fixtures/scanner-coach-vod.webm
ffmpeg -y -loglevel error \
	-f lavfi -t 315 -i color=c=black:s=320x180:r=2 \
	-c:v libvpx-vp9 -crf 50 -b:v 0 -g 20 -deadline good -cpu-used 4 "$COACH_OUT"

echo "wrote $COACH_OUT ($(du -h "$COACH_OUT" | cut -f1))"
