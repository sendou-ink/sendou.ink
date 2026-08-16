#!/bin/bash
# Memory watchdog: runs a command while sampling system-wide memory per second
# and hard-capping the command's own process tree before macOS starts killing
# the biggest process on the machine (usually the claude session).
#
# usage: memwatch.sh <log-dir> <cap-mb-per-process> -- <command...>
#
# writes to <log-dir>:
#   samples.tsv  time \t free-pct \t top processes "rss_mb:pid:comm" (system-wide)
#   events.log   watchdog kills and threshold crossings
set -u

LOG_DIR="$1"
CAP_MB="$2"
shift 2
[ "$1" = "--" ] && shift

mkdir -p "$LOG_DIR"
SAMPLES="$LOG_DIR/samples.tsv"
EVENTS="$LOG_DIR/events.log"
: >"$SAMPLES"
: >"$EVENTS"

"$@" &
ROOT_PID=$!

tree_pids() {
	# ROOT_PID plus all transitive children
	local all="$ROOT_PID" frontier="$ROOT_PID" next
	while [ -n "$frontier" ]; do
		next=$(pgrep -P "$(echo "$frontier" | tr ' ' ',')" 2>/dev/null | tr '\n' ' ')
		frontier=$(echo "$next" | xargs)
		[ -n "$frontier" ] && all="$all $frontier"
	done
	echo "$all"
}

while kill -0 "$ROOT_PID" 2>/dev/null; do
	ts=$(date +%H:%M:%S)
	free_pct=$(memory_pressure -Q 2>/dev/null | grep -oE '[0-9]+%' | head -1 | tr -d '%')
	top=$(ps -axo rss=,pid=,comm= | sort -rn | head -12 | awk '{printf "%d:%s:%s ", $1/1024, $2, $3}')
	printf '%s\t%s%%\t%s\n' "$ts" "${free_pct:-?}" "$top" >>"$SAMPLES"

	for pid in $(tree_pids); do
		rss_kb=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')
		[ -z "$rss_kb" ] && continue
		rss_mb=$((rss_kb / 1024))
		if [ "$rss_mb" -gt "$CAP_MB" ]; then
			cmd=$(ps -o command= -p "$pid" | cut -c1-200)
			echo "$ts KILLED pid=$pid rss=${rss_mb}MB > cap=${CAP_MB}MB cmd=$cmd" >>"$EVENTS"
			kill -9 "$pid"
		fi
	done

	if [ -n "$free_pct" ] && [ "$free_pct" -lt 15 ]; then
		echo "$ts PRESSURE free=${free_pct}% — top: $(echo "$top" | cut -c1-300)" >>"$EVENTS"
	fi
	sleep 1
done

wait "$ROOT_PID"
exit_code=$?
echo "$(date +%H:%M:%S) command exited with $exit_code" >>"$EVENTS"
exit "$exit_code"
