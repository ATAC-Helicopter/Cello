"""Run a private desktop bus and stop its service process group before cleanup."""
import os
import signal
import subprocess
import time


def run_private_session(arguments, env):
    process = subprocess.Popen(arguments, env=env, start_new_session=True)
    try:
        result = process.wait()
    finally:
        # Bus-activated helpers can still be writing when dbus-run-session exits.
        # Only signal the group created for this test; never the host desktop.
        for sig in [signal.SIGTERM, signal.SIGKILL]:
            try:
                os.killpg(process.pid, sig)
            except ProcessLookupError:
                break
            if sig == signal.SIGTERM:
                time.sleep(0.2)
    if result:
        raise subprocess.CalledProcessError(result, arguments)
