#!/bin/bash
# status.sh - what is happening across the servers, in the terminal.
# The same story as Admin -> Settings -> System, read from the backup bucket:
# who is live, how each server is doing, possible data loss, the latest events.
# Read-only. Works on any node that has `mc` and the R2 alias (Mac, Ubuntu, Pi).
#
#   docker/status.sh              summary + the latest 15 events
#   docker/status.sh -n 50        more events
#   docker/status.sh --loss       only the "possible data loss" list
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
[ -d "/opt/homebrew/bin" ] && export PATH="/opt/homebrew/bin:$PATH"

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../deploy/db-lib.sh
. "$APP_ROOT/deploy/db-lib.sh"

LIMIT=15; LOSS_ONLY=0
while [ $# -gt 0 ]; do
    case "$1" in
        -n) LIMIT="${2:?-n needs a number}"; shift 2 ;;
        --loss) LOSS_ONLY=1; shift ;;
        -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

db_init
find_mc || { echo "mc (MinIO client) not found in PATH" >&2; exit 1; }

STATUS_MC="$MC" STATUS_R2="$R2" STATUS_NODE="$NODE_NAME" STATUS_ROLE="${NODE_ROLE:-}" \
STATUS_LIMIT="$LIMIT" STATUS_LOSS_ONLY="$LOSS_ONLY" LEASE_MIN="$LEASE_MIN" python3 - <<'PY'
import json, os, shutil, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

MC, R2 = os.environ["STATUS_MC"], os.environ["STATUS_R2"]
LIMIT, LOSS_ONLY = int(os.environ["STATUS_LIMIT"]), os.environ["STATUS_LOSS_ONLY"] == "1"
NOW = int(time.time())
ONLINE, STALE = 150, 900
W = max(60, min(shutil.get_terminal_size((100, 24)).columns, 120))
tty = sys.stdout.isatty()
def c(code, s): return f"\033[{code}m{s}\033[0m" if tty else s
bold, dim, red, green, yellow, cyan = (lambda s: c("1", s)), (lambda s: c("2", s)), (lambda s: c("31", s)), (lambda s: c("32", s)), (lambda s: c("33", s)), (lambda s: c("36", s))

def run(*args):
    r = subprocess.run([MC, *args], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None

def getj(key):
    out = run("cat", f"{R2}/{key}")
    try: return json.loads(out) if out else None
    except ValueError: return None

def names(prefix):
    out = run("ls", f"{R2}/{prefix}") or ""
    return [l.split()[-1] for l in out.splitlines() if l.strip().endswith(".json")]

def ago(s):
    if s is None: return "unknown"
    if s < 5: return "just now"
    if s < 90: return f"{round(s)}s ago"
    if s < 5400: return f"{round(s/60)}m ago"
    if s < 172800: return f"{round(s/3600)}h ago"
    return f"{round(s/86400)}d ago"

def when(ts): return datetime.fromtimestamp(ts).strftime("%d %b %H:%M:%S")
def rule(ch="─"): print(dim(ch * W))

lease, latest, deployed = getj("primary.json"), getj("latest.json"), getj("deployed.json")
ev_names = sorted(names("events/"), reverse=True)

def fetch(keys):
    with ThreadPoolExecutor(8) as ex:
        return [e for e in ex.map(lambda k: getj(f"events/{k}"), keys) if e]

loss = fetch([k for k in ev_names if "_data_replaced_" in k][:30])
loss.sort(key=lambda e: e.get("ts", 0), reverse=True)

print()
print(bold(" Duka system status"), dim(f"   (read from the backup bucket; this node: {os.environ['STATUS_NODE']}"
      f"{' / ' + os.environ['STATUS_ROLE'] if os.environ['STATUS_ROLE'] else ''})"))
rule("═")

def show_loss():
    print(bold(" POSSIBLE DATA LOSS"), dim("(a server's data replaced by another's backup, last 30 days)"))
    if not loss:
        print(green("   none: no hand-over has replaced a server's data."))
        return
    for e in loss:
        d = e.get("data", {}); v = d.get("verdict", "identical_rowcounts")
        tag = {"rows_missing": red("ROWS MISSING"), "rows_added_only": yellow("only gained rows"), "identical_rowcounts": green("same row counts")}.get(v, v)
        print(f"   {tag}  {when(e.get('ts', 0))}  {e.get('node')} took {d.get('from', '?')}'s data"
              f"  ({d.get('rows_missing', 0)} rows missing, {d.get('rows_added', 0)} new)")
        for table, (before, after) in (d.get("changed") or {}).items():
            print(dim(f"       {table}: {before} -> {after}"))
        if d.get("safety_dump"):
            print(dim(f"       replaced data kept on {e.get('node')}: ~/.duka-backup/{d['safety_dump']}"))
    print(dim("   (row counts catch added or missing rows, not an edited value)"))

if LOSS_ONLY:
    show_loss(); print(); sys.exit(0)

# ---- live now ---------------------------------------------------------------
if lease and lease.get("node"):
    age = max(0, NOW - int(lease.get("ts", 0))); ttl = int(lease.get("ttl") or 0) or int(os.environ["LEASE_MIN"]) * 60
    fresh = age < ttl
    pin = yellow("  [taken over on purpose]") if lease.get("pinned") else ""
    print(f" LIVE NOW   {green(bold(lease['node'])) if fresh else red(bold(lease['node']) + ' (lease EXPIRED)')}{pin}")
    print(dim(f"            lease refreshed {ago(age)}; valid for {ttl // 60} min without a refresh"))
else:
    fresh = False
    print(f" LIVE NOW   {red(bold('nobody holds the lease'))}  {dim('(the next backup job to run takes it)')}")
if latest:
    t = datetime.strptime(latest["time"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp() if latest.get("time") else None
    print(f" BACKUP     {latest.get('bytes', 0) / 1048576:.1f} MB by {latest.get('node')}, {ago(NOW - int(t)) if t else 'unknown'}")
if deployed:
    print(f" DEPLOYED   {deployed.get('commit', '')[:10]} (by {deployed.get('node')})")
rule()

# ---- servers ----------------------------------------------------------------
print(bold(" SERVERS"))
beats = [b for b in (getj(f"nodes/{k}") for k in names("nodes/")) if b and b.get("node")]
if not beats:
    print(dim("   no heartbeats yet (they appear once the sync job runs on each server)"))
alerts = []
if lease and lease.get("node") and not fresh:
    alerts.append((red, f"the lease held by {lease['node']} expired: that server may be down"))
if not lease or not lease.get("node"):
    alerts.append((yellow, "nobody holds the primary lease"))
for b in sorted(beats, key=lambda b: (not (fresh and lease and lease.get("node") == b["node"]), b["node"])):
    age = max(0, NOW - int(b.get("ts", 0))); od, up = b.get("on_demand", False), b.get("db_up", True)
    status = "off" if od and not up else "online" if age < ONLINE else "stale" if age < STALE else "offline"
    dot = {"online": green("●"), "stale": yellow("●"), "offline": red("●"), "off": dim("○")}[status]
    live = bold(green(" LIVE")) if fresh and lease and lease.get("node") == b["node"] else "     "
    sync = green("data matches backup") if b.get("in_sync") else yellow("data differs from backup")
    tun = b.get("tunnel") or ""
    tunnel = (green("tunnel on ") if tun == "on" else dim("tunnel off")) if tun else dim("tunnel ?  ")
    print(f"   {dot} {b['node']:<8}{b.get('role', ''):<9}{live}  {status:<8} seen {ago(age):<10} code {b.get('commit', '?'):<9} {tunnel} {sync}")
    if status == "online" and b.get("app_up") is False: alerts.append((red, f"{b['node']}'s app does not answer on its port"))
    if status == "offline": alerts.append((yellow, f"{b['node']} has not reported for over 15 minutes"))
    if status == "online" and not b.get("in_sync") and not (fresh and lease and lease.get("node") == b["node"]):
        alerts.append((yellow, f"{b['node']} is online but its data does not match the newest backup yet"))
on = [b["node"] for b in beats if b.get("tunnel") == "on" and max(0, NOW - int(b.get("ts", 0))) < ONLINE]
if len(on) > 1:
    alerts.append((red, f"{' and '.join(on)} both have their tunnel up: Cloudflare splits visitors between them (random sign-outs, lost writes)"))
if any((e.get("data", {}).get("verdict") == "rows_missing") for e in loss):
    alerts.append((red, "a hand-over replaced a server's data with a backup that had fewer rows (see below)"))
rule()

print(bold(" ALERTS"))
if not alerts: print(green("   nothing needs attention"))
for col, msg in alerts: print(f"   {col('!')} {msg}")
rule()
show_loss()
rule()

# ---- timeline ---------------------------------------------------------------
print(bold(f" WHAT HAPPENED"), dim(f"(latest {LIMIT}, newest first)"))
events = fetch(ev_names[:LIMIT]); events.sort(key=lambda e: e.get("ts", 0), reverse=True)
if not events: print(dim("   no events yet (they appear once the servers run the new scripts)"))
for e in events:
    lvl = {"error": red("ERROR"), "warn": yellow("warn "), "info": dim("info ")}.get(e.get("level"), "info ")
    print(f"   {dim(when(e.get('ts', 0)))}  {lvl}  {e.get('node', ''):<7} {e.get('message', '')}")
print()
PY
