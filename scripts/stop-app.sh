#!/bin/bash
# Stops the frontend, backend, local Supabase stack, and Docker for this project.
set -uo pipefail

PROJECT_DIR="/Users/henrygerlach/Documents/Repositories/personal/Garmin Activity Map"
RUN_DIR="$PROJECT_DIR/.run"
mkdir -p "$RUN_DIR"
exec >>"$RUN_DIR/stop-app.log" 2>&1
echo "==== $(date) ===="

# GUI launches (Spotlight/Finder) don't source ~/.zshrc, so PATH is minimal.
export PATH="/Users/henrygerlach/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

notify() {
  osascript -e "display notification \"$1\" with title \"Garmin Activity Map\"" >/dev/null 2>&1
}

# Every step is both logged and shown as a notification: the app is launched from
# Spotlight, so the log is the only other feedback and nobody watches it.
step() {
  echo "$1"
  notify "$1"
}

step "Shutting down ..."

# cwd of a process, or empty if it's gone / not inspectable.
proc_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1
}

# TERM a whole process group, then KILL whatever is still standing.
kill_group() {
  local pgid="$1" i
  kill -TERM "-$pgid" 2>/dev/null
  for i in 1 2 3 4 5 6; do
    kill -0 "-$pgid" 2>/dev/null || return 0
    sleep 0.5
  done
  kill -KILL "-$pgid" 2>/dev/null
}

# Fallback for servers started before start-app.sh wrote pid files: `npm run
# dev` spawns tsx/vite, which spawns the process that actually listens. Killing
# only the listener leaves the npm and tsx watchers alive, so walk up from the
# listener and take out every ancestor still sitting inside this project.
kill_listener_tree() {
  local pid="$1" ppid cwd
  while [ -n "$pid" ] && [ "$pid" != "1" ] && [ "$pid" != "0" ]; do
    cwd=$(proc_cwd "$pid")
    case "$cwd" in
      "$PROJECT_DIR"|"$PROJECT_DIR"/*) ;;
      *) return 0 ;;  # left the project: stop before we hit a shell or Finder
    esac
    ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    echo "  killing pid $pid ($(ps -o comm= -p "$pid" 2>/dev/null))"
    kill -TERM "$pid" 2>/dev/null
    sleep 0.3
    kill -KILL "$pid" 2>/dev/null
    pid="$ppid"
  done
}

stop_server() {
  local port="$1" name="$2" pgid pid stopped=0
  # Separate statement: `local` expands all its words before any assignment
  # takes effect, so referencing $name above would trip `set -u`.
  local pidfile="$RUN_DIR/$name.pid"
  if [ -f "$pidfile" ]; then
    pgid=$(tr -d '[:space:]' <"$pidfile")
    if [ -n "$pgid" ] && kill -0 "-$pgid" 2>/dev/null; then
      step "Stopping $name (process group $pgid) ..."
      kill_group "$pgid"
      stopped=1
    fi
    rm -f "$pidfile"
  fi

  pid=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | head -1)
  if [ -n "$pid" ]; then
    step "Stopping $name leftovers on port $port (pid $pid) ..."
    kill_listener_tree "$pid"
    stopped=1
  fi

  if [ "$stopped" -eq 1 ]; then
    step "$name stopped."
  else
    step "$name was not running."
  fi
}

stop_server 5173 frontend
stop_server 8787 backend

if ! cd "$PROJECT_DIR"; then
  echo "Project directory not found: $PROJECT_DIR"
  notify "Error: project directory not found - $PROJECT_DIR"
  exit 1
fi
if supabase status >/dev/null 2>&1; then
  step "Stopping Supabase ..."
  if supabase stop; then
    step "Supabase stopped."
  else
    echo "supabase stop failed"
    notify "Error: supabase stop failed - see .run/stop-app.log"
  fi
else
  step "Supabase was not running."
fi

if docker info >/dev/null 2>&1; then
  if command -v colima >/dev/null 2>&1 && colima status >/dev/null 2>&1; then
    step "Stopping colima ..."
    if colima stop >>"$RUN_DIR/colima.log" 2>&1; then
      step "Colima stopped."
    else
      echo "colima stop failed"
      notify "Error: colima stop failed - see .run/colima.log"
    fi
  else
    step "Quitting Docker ..."
    osascript -e 'quit app "Docker"' >/dev/null 2>&1
    step "Docker quit."
  fi
else
  step "Docker was not running."
fi

echo "Done."
notify "Done - frontend, backend, Supabase, and Docker are stopped."
