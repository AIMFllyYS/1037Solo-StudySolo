"""StudySolo command supervisor. Runs inside one tenant's ephemeral cloud sandbox."""
import json
import ctypes
import os
import pwd
import resource
import selectors
import signal
import subprocess
import sys
import time
from pathlib import Path

job_dir = Path(sys.argv[1])
spec = json.loads((job_dir / "request.json").read_text())
limit = 262144
deadline = time.monotonic() + min(max(int(spec["timeout"]), 1), 600)
stdout = bytearray()
stderr = bytearray()
state = {"state": "running", "exitCode": None}
execution_account = pwd.getpwnam("studysolo")
if os.geteuid() != 0 or execution_account.pw_uid != 10001:
    raise RuntimeError("trusted supervisor identity required")


def publish():
    temporary = job_dir / "state.pending"
    temporary.write_text(json.dumps({**state, "stdout": stdout.decode("utf-8", "replace"), "stderr": stderr.decode("utf-8", "replace")}, ensure_ascii=False))
    os.replace(temporary, job_dir / "state.json")


def stop_group():
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    # One command per sandbox. Kill even children that escaped the original
    # process group with setsid; this UID owns no supervisor or other tenant.
    for entry in Path("/proc").iterdir():
        if entry.name.isdecimal():
            try:
                if entry.stat().st_uid == execution_account.pw_uid:
                    os.kill(int(entry.name), signal.SIGKILL)
            except (ProcessLookupError, FileNotFoundError, PermissionError):
                pass


def restrict_child():
    # Linux no_new_privs blocks sudo/setuid/file-capability privilege recovery.
    if ctypes.CDLL(None, use_errno=True).prctl(38, 1, 0, 0, 0) != 0:
        raise RuntimeError("no_new_privs unavailable")
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))
    resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
    resource.setrlimit(resource.RLIMIT_FSIZE, (104857600, 104857600))


try:
    process = subprocess.Popen(
        [sys.executable, "-I", "/var/lib/studysolo-jobs/namespace.py", spec["command"]],
        cwd=spec["cwd"],
        env={"PATH": "/opt/studysolo/bin:/usr/local/bin:/usr/bin:/bin", "HOME": "/home/studysolo", "LANG": "C.UTF-8", "TMPDIR": "/tmp", "PYTHONUNBUFFERED": "1", "NODE_PATH": "/opt/studysolo/node_modules", "PLAYWRIGHT_BROWSERS_PATH": "/opt/studysolo/browsers"},
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
        user=0,
        group=0,
        extra_groups=[],
        umask=0o077,
        preexec_fn=restrict_child,
    )
except Exception:
    state = {"state": "failed", "exitCode": 127, "reason": "start_failed"}
    publish()
    sys.exit(1)
state["childPid"] = process.pid
publish()
selector = selectors.DefaultSelector()
selector.register(process.stdout, selectors.EVENT_READ, stdout)
selector.register(process.stderr, selectors.EVENT_READ, stderr)
last_publish = time.monotonic()
try:
    while selector.get_map():
        if (job_dir / "cancel").exists():
            state["reason"] = "cancelled"
            stop_group()
        if time.monotonic() > deadline:
            state["reason"] = "timeout"
            stop_group()
        for key, _ in selector.select(timeout=0.1):
            chunk = os.read(key.fileobj.fileno(), 8192)
            if not chunk:
                selector.unregister(key.fileobj)
                continue
            if len(stdout) + len(stderr) + len(chunk) > limit:
                state["reason"] = "output_limit"
                stop_group()
            else:
                key.data.extend(chunk)
        if time.monotonic() - last_publish > 0.5:
            publish()
            last_publish = time.monotonic()
        # Detached children may keep inherited pipes open; the supervisor still
        # exits at the command deadline and the sandbox itself has a fixed TTL.
        if time.monotonic() > deadline + 2:
            break
    state["exitCode"] = process.wait(timeout=3)
    state["state"] = "completed"
except Exception:
    stop_group()
    state["state"] = "failed"
    state["reason"] = "supervisor_error"
finally:
    stop_group()
    selector.close()
    publish()
