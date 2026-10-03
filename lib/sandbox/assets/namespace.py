"""Trusted launcher: namespace root maps to an ordinary host UID, never host root."""
import ctypes
import fcntl
import os
import pwd
import select
import signal
import socket
import struct
import sys

account = pwd.getpwnam("studysolo")
if os.geteuid() != 0 or account.pw_uid != 10001:
    raise RuntimeError("trusted launcher identity required")
libc = ctypes.CDLL(None, use_errno=True)
ready_read, ready_write = os.pipe()
mapped_read, mapped_write = os.pipe()
child = os.fork()
if child:
    os.close(ready_write)
    os.close(mapped_read)
    try:
        if not select.select([ready_read], [], [], 5)[0] or os.read(ready_read, 1) != b"R":
            raise RuntimeError("namespace creation failed")
        # Parent retains only its trusted control authority. The child cannot
        # choose mappings or execute tenant code before becoming host UID 10001.
        with open(f"/proc/{child}/setgroups", "w") as file:
            file.write("deny")
        with open(f"/proc/{child}/uid_map", "w") as file:
            file.write(f"0 {account.pw_uid} 1\n")
        with open(f"/proc/{child}/gid_map", "w") as file:
            file.write(f"0 {account.pw_gid} 1\n")
        os.write(mapped_write, b"M")
        os.close(mapped_write)
        _, status = os.waitpid(child, 0)
        sys.exit(os.waitstatus_to_exitcode(status) if os.WIFEXITED(status) else 128 + os.WTERMSIG(status))
    except Exception as error:
        print(f"namespace_parent_failed:{type(error).__name__}:{getattr(error, 'errno', '')}", file=sys.stderr)
        try:
            os.kill(child, signal.SIGKILL)
        except ProcessLookupError:
            pass
        os.waitpid(child, 0)
        sys.exit(126)
else:
    os.close(ready_read)
    os.close(mapped_write)
    try:
        stage = "unshare"
        # USER first gives this new namespace its own administrative capability;
        # it grants no capability over the enclosing sandbox's resources.
        flags = 0x10000000 | 0x40000000 | 0x00020000
        if libc.unshare(flags) != 0:
            raise OSError(ctypes.get_errno(), "namespace creation denied")
        os.write(ready_write, b"R")
        os.close(ready_write)
        if not select.select([mapped_read], [], [], 5)[0] or os.read(mapped_read, 1) != b"M":
            raise RuntimeError("namespace mapping failed")
        os.close(mapped_read)
        stage = "setgid"
        os.setgid(0)
        stage = "setuid"
        os.setuid(0)
        # A dedicated mount tree prevents tenant mounts affecting the control
        # plane. Keep the provider's single-tenant PID/proc view paired: this
        # runtime rejects proc remounts, and mismatched PID/proc namespaces break
        # normal CLI tools. Signals to host-root are denied by the UID mapping.
        stage = "mount_private"
        if libc.mount(None, b"/", None, 16384 | 262144, None) != 0:
            raise OSError(ctypes.get_errno(), "private mounts denied")
        stage = "loopback"
        network = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        loopback = struct.unpack("16sh", fcntl.ioctl(network, 0x8913, struct.pack("16sh", b"lo", 0))[:18])[1]
        fcntl.ioctl(network, 0x8914, struct.pack("16sh", b"lo", loopback | 1))
        network.close()
        os.execve("/bin/bash", ["/bin/bash", "-c", sys.argv[1]], dict(os.environ))
    except Exception as error:
        print(f"namespace_child_failed:{stage}:{type(error).__name__}:{getattr(error, 'errno', '')}", file=sys.stderr)
        # Never fall back to running tenant code outside the namespace.
        os._exit(126)
