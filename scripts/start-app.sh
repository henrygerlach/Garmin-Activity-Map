#!/bin/bash
# Starts Supabase (Docker), the backend, and the frontend dev server if they
# aren't already running, then opens the app in the default browser.
# Invoked by the "Garmin Activity Map.app" Spotlight launcher in ~/Applications.
set -uo pipefail

PROJECT_DIR="/Users/henrygerlach/Documents/Repositories/personal/Garmin Activity Map"
RUN_DIR="$PROJECT_DIR/.run"
mkdir -p "$RUN_DIR"
exec >>"$RUN_DIR/start-app.log" 2>&1
echo "==== $(date) ===="

# GUI launches (Spotlight/Finder) don't source ~/.zshrc, so PATH is minimal.
export PATH="/Users/henrygerlach/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

FRONTEND_URL="http://localhost:5173"
NOTIFY_TITLE="Garmin Activity Map"

notify() {
  osascript -e "display notification \"$1\" with title \"$NOTIFY_TITLE\"" >/dev/null 2>&1
}

# Every step is both logged and shown as a notification: the app is launched from
# Spotlight, so the log is the only other feedback and nobody watches it.
step() {
  echo "$1"
  notify "$1"
}

port_open() {
  nc -z localhost "$1" >/dev/null 2>&1
}

# PID of whatever process is LISTENing on a port, if any.
port_owner_pid() {
  lsof -ti tcp:"$1" -sTCP:LISTEN 2>/dev/null | head -1
}

# True if the process on $1 has its cwd inside $2 (i.e. it's *this* project's
# server, not a leftover from some other/renamed/moved checkout).
port_owned_by_dir() {
  local pid cwd
  pid=$(port_owner_pid "$1")
  [ -z "$pid" ] && return 1
  cwd=$(lsof -p "$pid" 2>/dev/null | awk '$4 == "cwd" { print $NF; exit }')
  [ "$cwd" = "$2" ]
}

# Make sure $3 (backend/frontend) is running out of $2 and listening on $1,
# killing and replacing any stale/wrong-directory process squatting the port.
ensure_server() {
  local port="$1" dir="$2" name="$3" pid
  if port_open "$port"; then
    if port_owned_by_dir "$port" "$dir"; then
      step "$name already running on port $port."
      return
    fi
    pid=$(port_owner_pid "$port")
    step "$name: replacing stale process $pid on port $port ..."
    kill "$pid" 2>/dev/null
    sleep 1
    kill -9 "$pid" 2>/dev/null
  fi
  step "Starting $name ..."
  # `set -m` turns on job control inside the subshell, which puts the whole
  # npm -> tsx/vite -> node tree into its own process group. We record that
  # group in $name.pid so stop-app.sh can take the tree down with one signal
  # instead of only killing whichever descendant happens to hold the port.
  (
    cd "$dir" || exit 1
    set -m
    nohup npm run dev >"$RUN_DIR/$name.log" 2>&1 &
    echo $! >"$RUN_DIR/$name.pid"
  )
}

step "Starting up ..."

# 1. Docker must be up before `supabase start` will work.
if ! docker info >/dev/null 2>&1; then
  if command -v colima >/dev/null 2>&1; then
    step "Starting colima ..."
    colima start >>"$RUN_DIR/colima.log" 2>&1
  else
    step "Starting Docker ..."
    open -a Docker
  fi
  waited=0
  until docker info >/dev/null 2>&1; do
    sleep 2
    waited=$((waited + 2))
    if [ "$waited" -ge 90 ]; then
      echo "Docker did not start in time"
      notify "Error: Docker didn't start in time."
      exit 1
    fi
  done
  step "Docker is ready."
else
  step "Docker already running."
fi

# 2. Local Supabase stack.
cd "$PROJECT_DIR" || exit 1
if ! supabase status >/dev/null 2>&1; then
  step "Starting Supabase ..."
  if ! supabase start >>"$RUN_DIR/supabase.log" 2>&1; then
    echo "supabase start failed"
    notify "Error: supabase start failed - see .run/supabase.log"
    exit 1
  fi
  step "Supabase is up."
else
  step "Supabase already running."
fi

# 3. Backend (http://127.0.0.1:8787) and frontend (http://localhost:5173).
ensure_server 8787 "$PROJECT_DIR/backend" backend
ensure_server 5173 "$PROJECT_DIR/frontend" frontend

# 5. Wait for the frontend to answer, then open it.
step "Waiting for the frontend to answer ..."
waited=0
until curl -sf "$FRONTEND_URL" >/dev/null 2>&1; do
  sleep 1
  waited=$((waited + 1))
  if [ "$waited" -ge 60 ]; then
    echo "Frontend did not come up in time"
    notify "Error: frontend didn't start in time - see .run/frontend.log"
    exit 1
  fi
done

step "Ready - opening $FRONTEND_URL"
open "$FRONTEND_URL"
