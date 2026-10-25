#!/usr/bin/env bash
# Repeatable latency benchmark for the native app. Emulator first (the decisive target), phone as a sanity check.
#
#   tools/bench.sh [-s SERIAL] [-n RUNS] [-m MODES] [-l LABEL] [-a APK]
#
# MODES (comma separated, default "launch,tap,frames,locate,coldloc"):
#   launch   force-stop, `am start -W` (TotalTime/WaitTime) + XarxaPerf marks: app/activity create, graph ready,
#            style loaded, first map frame, fully rendered map, first trains, first arrival, hubs done, sync done
#   tap      warm (hub already synced) and cold (uncached station) tap -> sheet with arrivals; location revoked
#   frames   gfxinfo janky % and render-thread frame intervals during pans and double-tap zooms + 4 Hz marker updates
#   locate   launch with location allowed and a recent fix: launch -> blue dot -> nearest station sheet
#   coldloc  location toggled off/on (no last known fix), the emulator fix arrives 3 s after launch: fix -> dot -> sheet
#
# Reports median and p90 over RUNS (>= 5; run 0 after install is a warm-up and is discarded).
# Needs the "bench" build type (release settings, debug keystore, XarxaPerf marks): ./gradlew :app:assembleBench
# Conditions held constant: screen on, animations unchanged, same geo fix, no AVD wipe. Network state is printed.
set -euo pipefail

SERIAL=emulator-5554
RUNS=5
MODES=launch,tap,frames,locate,coldloc
LABEL=run
APK=""
while getopts "s:n:m:l:a:" o; do
  case $o in s) SERIAL=$OPTARG;; n) RUNS=$OPTARG;; m) MODES=$OPTARG;; l) LABEL=$OPTARG;; a) APK=$OPTARG;; *) exit 2;; esac
done
export ANDROID_HOME=${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}
export PATH=$ANDROID_HOME/platform-tools:$PATH
PKG=com.jielei.xarxa.nativeapp
ACT=$PKG/.MainActivity
ADB="adb -s $SERIAL"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=${BENCH_OUT:-$ROOT/build/bench}
mkdir -p "$OUT"
LAT=39.4699 LON=-0.3763   # Plaça de l'Ajuntament; same fix every run
IS_EMU=0; case $SERIAL in emulator-*) IS_EMU=1;; esac

[ -n "$APK" ] && { $ADB install -r "$APK" >/dev/null; echo "installed $APK"; }
$ADB shell svc power stayon true >/dev/null 2>&1 || $ADB shell svc power stayon usb >/dev/null 2>&1 || true
$ADB shell input keyevent KEYCODE_WAKEUP; $ADB shell wm dismiss-keyguard >/dev/null 2>&1 || true
echo "# $LABEL device=$SERIAL runs=$RUNS modes=$MODES net=$($ADB shell dumpsys connectivity | grep -m1 -o 'MOBILE\|WIFI' || echo '?')"
echo "# $($ADB shell dumpsys package $PKG | grep -m1 lastUpdateTime)"

# Some phones refuse `pm grant` over adb: then the permission must already be granted in Settings.
grant()  { $ADB shell pm grant $PKG android.permission.ACCESS_FINE_LOCATION >/dev/null 2>&1 || true; $ADB shell pm grant $PKG android.permission.ACCESS_COARSE_LOCATION >/dev/null 2>&1 || true; }
revoke() { $ADB shell pm revoke $PKG android.permission.ACCESS_FINE_LOCATION 2>/dev/null || true; $ADB shell pm revoke $PKG android.permission.ACCESS_COARSE_LOCATION 2>/dev/null || true; }
geofix() { if [ $IS_EMU = 1 ]; then $ADB emu geo fix $LON $LAT >/dev/null; fi; }
LAUNCH_EXTRA=""
launch() { $ADB shell am force-stop $PKG; $ADB logcat -c; sleep 1; $ADB shell am start -W -n $ACT $LAUNCH_EXTRA; }
marks()  { $ADB logcat -d -v epoch -s XarxaPerf:I; }
now_ms() { $ADB shell 'date +%s%3N' | tr -d '\r'; }

summarise() { python3 - "$1" <<'PY'
import json,sys,statistics
rows=[json.loads(l) for l in open(sys.argv[1])]
keys=[]
for r in rows:
    for k in r:
        if k not in keys: keys.append(k)
def p90(v):
    v=sorted(v); return v[min(len(v)-1,int(round(0.9*(len(v)-1))))]
print(f"  {'metric':34s} {'median':>9s} {'p90':>9s} {'min':>9s} {'max':>9s}  n")
for k in keys:
    v=[r[k] for r in rows if k in r and r[k] is not None]
    if not v: print(f"  {k:34s} {'n/a':>9s}"); continue
    print(f"  {k:34s} {statistics.median(v):9.1f} {p90(v):9.1f} {min(v):9.1f} {max(v):9.1f}  {len(v)}")
PY
}

parse() { python3 -c '
import sys,re,json
mode=sys.argv[1]; extra=json.loads(sys.argv[2]) if len(sys.argv)>2 else {}
lines=sys.stdin.read().splitlines()
seq=[]
for l in lines:
    m=re.search(r"XarxaPerf:\s+(\S+) (\d+)$",l)
    if m: seq.append((m.group(1),int(m.group(2)),float(l.split()[0])))
first={}
for n,v,ts in seq: first.setdefault(n,v)
out={}
def pick(k):
    if k in first: out[k]=first[k]
if mode=="launch":
    for k in ["app_create","act_create","graph_ready","content_compose","map_async","style_loaded","first_frame","map_fully_rendered","first_trains","first_arrival","hubs_done","sync_done"]: pick(k)
elif mode in ("locate","coldloc"):
    for k in ["content_compose","style_loaded","map_fully_rendered","locate_start","user_dot"]: pick(k)
    for n,v,ts in seq:
        if n.startswith("locate_nearest") and "nearest_selected" not in out: out["nearest_selected"]=v
        if n.startswith("sheet_arrivals") and "sheet_arrivals" not in out: out["sheet_arrivals"]=v
    ci=[v for n,v,ts in seq if n=="cam_idle" and "user_dot" in out and v>=out["user_dot"]]
    if "user_dot" in out and "locate_start" in out: out["locate_start->dot"]=out["user_dot"]-out["locate_start"]
    if "sheet_arrivals" in out and "user_dot" in out: out["dot->sheet_arrivals"]=out["sheet_arrivals"]-out["user_dot"]
    if ci: out["dot->cam_idle(zoom done)"]=ci[0]-out["user_dot"]
    if mode=="coldloc" and "fix_wall" in extra:
        dots=[ts for n,v,ts in seq if n=="user_dot"]
        if dots: out["geofix->dot"]=dots[0]*1000-extra["fix_wall"]
        sh=[ts for n,v,ts in seq if n.startswith("sheet_arrivals")]
        if sh: out["geofix->sheet_arrivals"]=sh[0]*1000-extra["fix_wall"]
elif mode=="tap":
    taps=[(n,v) for n,v,ts in seq if n.startswith("tap:")]
    for label,idx in (("warm",0),("cold",1)):
        if len(taps)>idx:
            n,v=taps[idx]; sid=n.split(":",1)[1]
            sh=[x for x in seq if x[0]=="sheet_arrivals:"+sid and x[1]>=v]
            ci=[x for x in seq if x[0]=="cam_idle" and x[1]>=v]
            if sh: out[label+"_tap->sheet_arrivals"]=sh[0][1]-v
            if ci: out[label+"_tap->camera_idle"]=ci[0][1]-v
elif mode=="frames":
    n=slow=0; p90s=[]; p50s=[]; mx=0
    for l in lines:
        m=re.search(r"frames n=(\d+) p50=([\d.]+) p90=([\d.]+) max=([\d.]+) slow=(\d+)",l)
        if m:
            n+=int(m.group(1)); slow+=int(m.group(5)); p50s.append(float(m.group(2))); p90s.append(float(m.group(3))); mx=max(mx,float(m.group(4)))
    if n: out.update({"map_frames":n,"map_slow_pct(>20ms)":100.0*slow/n,"map_p50_ms":sorted(p50s)[len(p50s)//2],"map_p90_ms":sorted(p90s)[len(p90s)//2],"map_max_ms":mx})
    out.update(extra.get("gfx",{}))
print(json.dumps(out))
' "$@"; }

for mode in ${MODES//,/ }; do
  F=$OUT/$LABEL-$mode.jsonl; : > "$F"
  echo "== $mode ($LABEL, $SERIAL) =="
  for i in $(seq 0 "$RUNS"); do   # run 0 is warm-up and dropped
    rm -f "$F.tmp"
    case $mode in
      launch)
        revoke; geofix
        W=$(launch | tr -d '\r'); sleep 14
        TOT=$(echo "$W" | sed -n 's/^TotalTime: //p'); WAIT=$(echo "$W" | sed -n 's/^WaitTime: //p')
        marks | parse launch "{}" | python3 -c "import json,sys; r=json.load(sys.stdin); print(json.dumps({'am_TotalTime':float('${TOT:-0}'),'am_WaitTime':float('${WAIT:-0}'),**r}))" > "$F.tmp"
        ;;
      tap)
        # Two launches per run: cold (uncached station, tapped first) and warm (synced hub). One tap per launch,
        # because closing a sheet now zooms the camera out and moves every other station on screen.
        revoke; geofix
        : > "$OUT/.tap_cold"; : > "$OUT/.tap_warm"
        for kind in cold warm; do
          launch >/dev/null; sleep 22
          M=$(marks)
          if [ $kind = warm ]; then api=17; else api=15; fi
          read TX TY < <(echo "$M" | sed -n "s/.*stpx api=$api .* x=\([0-9-]*\) y=\([0-9-]*\)/\1 \2/p" | tail -1) || true
          if [ -z "${TX:-}" ]; then echo "  run $i: no station pixel for $kind"; continue; fi
          $ADB shell input tap "$TX" "$TY"; sleep 6
          marks | parse tap "{}" | sed "s/warm_tap/${kind}_tap/g; s/cold_tap/${kind}_tap/g" > "$OUT/.tap_$kind"
        done
        python3 -c "
import json
o={}
for k in ('cold','warm'):
    try: o.update(json.loads(open('$OUT/.tap_'+k).read() or '{}'))
    except Exception: pass
print(json.dumps(o))" > "$F.tmp"
        ;;
      frames)
        # About 140 fake markers (debug/bench builds): the real service is off at night and the load must be comparable.
        LAUNCH_EXTRA="--ez fakeTrains true --ez fakeMany true"
        revoke; geofix; launch >/dev/null; sleep 20
        read SW SH < <($ADB shell wm size | sed -n 's/.*: \([0-9]*\)x\([0-9]*\).*/\1 \2/p' | tail -1)
        CXm=$((SW/2)); CYm=$((SH/2)); D=$((SW/3))
        $ADB logcat -c; $ADB shell dumpsys gfxinfo $PKG reset >/dev/null
        for r in 1 2 3 4; do
          $ADB shell input swipe $((CXm-D)) $CYm $((CXm+D)) $((CYm+D/2)) 350
          $ADB shell input swipe $((CXm+D)) $((CYm+D/2)) $((CXm-D)) $CYm 350
          $ADB shell input tap $CXm $CYm; $ADB shell input tap $CXm $CYm; sleep 1
          $ADB shell input swipe $CXm $((CYm-D)) $CXm $((CYm+D)) 250
          $ADB shell input swipe $CXm $((CYm+D)) $CXm $((CYm-D)) 250
        done
        sleep 1
        GFX=$($ADB shell dumpsys gfxinfo $PKG | tr -d '\r' | python3 -c "
import sys,re,json
t=sys.stdin.read(); o={}
m=re.search(r'Total frames rendered: (\d+)',t); o['ui_frames']=int(m.group(1)) if m else 0
m=re.search(r'Janky frames: (\d+) \(([\d.]+)%\)',t)
if m: o['ui_janky_pct']=float(m.group(2))
for p in (50,90,95,99):
    m=re.search(r'%dth percentile: (\d+)ms'%p,t)
    if m: o['ui_p%d_ms'%p]=int(m.group(1))
print(json.dumps({'gfx':o}))")
        marks | parse frames "$GFX" > "$F.tmp"
        ;;
      locate)
        grant; geofix; sleep 2
        launch >/dev/null; sleep 12
        marks | parse locate "{}" > "$F.tmp"
        ;;
      coldloc)
        grant
        $ADB shell cmd location set-location-enabled false >/dev/null 2>&1 || true; sleep 1
        $ADB shell cmd location set-location-enabled true >/dev/null 2>&1 || true; sleep 1
        launch >/dev/null; sleep 3
        geofix; FW=$(now_ms); sleep 12
        marks | parse coldloc "{\"fix_wall\": $FW}" > "$F.tmp"
        ;;
    esac
    if [ "$i" -gt 0 ] && [ -f "$F.tmp" ]; then cat "$F.tmp" >> "$F"; fi
    rm -f "$F.tmp"
    echo "  run $i done$([ "$i" = 0 ] && echo ' (warm-up, discarded)')"
  done
  summarise "$F"
done
$ADB shell am force-stop $PKG
