#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
import json,os,subprocess
from pathlib import Path
f=Path('data/processes.json')
if not f.exists():print('Demo is already stopped.');raise SystemExit
v=json.loads(f.read_text());pid=v['supervisor']
try:cmd=subprocess.check_output(['ps','-p',str(pid),'-o','command='],text=True)
except subprocess.CalledProcessError:f.unlink();print('No demo supervisor running.');raise SystemExit
if 'runtime/launch.ts' not in cmd:raise SystemExit('PID ownership cannot be verified. No process was stopped.')
if v['root']!=str(Path.cwd()):raise SystemExit('Workspace ownership mismatch. No process was stopped.')
os.kill(pid,15)
print('Demo-only shutdown requested. Demo state and authorization revoked; stable installation untouched.')
PY
