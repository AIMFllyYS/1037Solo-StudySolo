"""Verify a downloaded Web release without extracting files or starting services."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import tarfile
from pathlib import Path, PurePosixPath

REQUIRED = {
    "server.js", ".next/BUILD_ID", "node_modules/next/package.json",
    "runtime/search-worker/search/worker/index.mjs", "content/.index/manifest.json",
    "lib/sandbox/skill-packs/catalog.json", "studysolo-release.json",
    "public/studysolo-release.json",
}
DENIED = {".git", ".local-archive", "_raw", "_raw-src", "dist-desktop"}


def require(condition: bool, code: str) -> None:
    if not condition:
        raise ValueError(code)


def bounded_path(name: str) -> PurePosixPath:
    require("\\" not in name and "\x00" not in name, "archive_path_invalid")
    path = PurePosixPath(name)
    require(not path.is_absolute() and ".." not in path.parts, "archive_path_outside")
    require(not any(":" in part for part in path.parts), "archive_path_invalid")
    require(not any(part in DENIED or part == ".env" or part.startswith(".env.")
                    or part.startswith(".mcp") for part in path.parts),
            "archive_private_file_forbidden")
    return path


def bounded_link(member_path: PurePosixPath, name: str) -> PurePosixPath:
    require("\\" not in name and "\x00" not in name, "archive_link_invalid")
    target = PurePosixPath(name)
    require(not target.is_absolute() and not any(":" in p for p in target.parts),
            "archive_link_outside")
    stack = list(member_path.parent.parts)
    for part in target.parts:
        if part == "..":
            require(bool(stack), "archive_link_outside")
            stack.pop()
        elif part != ".":
            stack.append(part)
    return bounded_path("/".join(stack))


def verify(reference_path: Path, expected_commit: str) -> dict:
    require(bool(re.fullmatch(r"[a-f0-9]{40}", expected_commit)), "expected_commit_invalid")
    metadata = json.loads(reference_path.read_text(encoding="utf-8"))
    require(metadata.get("schemaVersion") == 1 and metadata.get("product") == "StudySolo"
            and metadata.get("target") == "linux-amd64-web", "release_reference_invalid")
    require(metadata.get("commit") == expected_commit, "release_commit_mismatch")
    require(metadata.get("operatorEnvironmentIncluded") is False
            and metadata.get("serviceStarted") is False, "release_reference_invalid")
    require(isinstance(metadata.get("files"), int) and metadata["files"] > 0
            and isinstance(metadata.get("bytes"), int) and metadata["bytes"] > 0,
            "release_reference_invalid")
    expected_hash = metadata.get("archiveSha256")
    require(isinstance(expected_hash, str) and bool(re.fullmatch(r"[a-f0-9]{64}", expected_hash)),
            "archive_hash_invalid")
    archive = reference_path.parent / ("studysolo-web-" + expected_commit + ".tar.gz")
    digest = hashlib.sha256()
    with archive.open("rb") as stream:
        while chunk := stream.read(4 * 1024 * 1024):
            digest.update(chunk)
    require(digest.hexdigest() == expected_hash, "archive_hash_mismatch")

    members: dict[str, tarfile.TarInfo] = {}
    links: dict[str, str] = {}
    markers: dict[str, bytes] = {}
    files = 0
    payload_bytes = 0
    marker_names = {"studysolo-release.json", "public/studysolo-release.json", ".next/BUILD_ID"}
    with tarfile.open(archive, "r|gz") as tar:
        for member in tar:
            path = bounded_path(member.name)
            name = str(path)
            require(name not in members, "archive_duplicate_member")
            require(member.isfile() or member.isdir() or member.issym(), "archive_special_file")
            members[name] = member
            if member.issym():
                links[name] = str(bounded_link(path, member.linkname))
            if member.isfile():
                files += 1
                payload_bytes += member.size
                if name in marker_names:
                    require(member.size <= 16 * 1024, "release_marker_oversized")
                    stream = tar.extractfile(member)
                    require(stream is not None, "release_marker_missing")
                    markers[name] = stream.read()

    # Disallow archive writes through a symlink ancestor. Every runtime link must
    # resolve to another member; no extraction code needs to follow external paths.
    for name in members:
        for ancestor in PurePosixPath(name).parents:
            require(str(ancestor) not in links, "archive_symlink_ancestor")
    def resolve_member(name: str) -> tarfile.TarInfo | None:
        visited: set[str] = set()
        # pnpm links directories; runtime paths such as next/package.json need
        # bounded prefix resolution, even though the tar never writes through it.
        while True:
            require(name not in visited and len(visited) < 128, "archive_link_cycle")
            visited.add(name)
            parts = PurePosixPath(name).parts
            replacement = None
            for length in range(1, len(parts) + 1):
                prefix = str(PurePosixPath(*parts[:length]))
                if prefix in links:
                    replacement = str(bounded_path(str(PurePosixPath(
                        links[prefix], *parts[length:]))))
                    break
            if replacement is None:
                return members.get(name)
            name = replacement

    for name in links:
        require(resolve_member(name) is not None, "archive_link_target_missing")
    required_members = [resolve_member(name) for name in REQUIRED]
    require(all(member is not None for member in required_members), "release_runtime_missing")
    require(all(member is not None and member.isfile() for member in required_members),
            "release_runtime_not_regular")
    require(marker_names.issubset(markers), "release_marker_missing")
    full_marker = json.loads(markers["studysolo-release.json"])
    require(full_marker == {key: value for key, value in metadata.items() if key != "archiveSha256"},
            "release_marker_mismatch")
    public_marker = json.loads(markers["public/studysolo-release.json"])
    require(public_marker == {key: metadata[key] for key in
            ("schemaVersion", "product", "target", "commit", "version", "buildId")},
            "release_public_marker_mismatch")
    require(markers[".next/BUILD_ID"].decode("utf-8").strip() == metadata["buildId"],
            "release_build_id_mismatch")
    require(files == metadata["files"] + 2, "archive_file_count_mismatch")
    require(payload_bytes - len(markers["studysolo-release.json"])
            - len(markers["public/studysolo-release.json"]) == metadata["bytes"],
            "archive_byte_count_mismatch")
    return {"schemaVersion": 1, "sourceCommit": expected_commit,
            "buildId": metadata["buildId"], "archiveSha256": expected_hash,
            "files": files, "unpackedBytes": payload_bytes,
            "sha256Verified": True, "tarPathsBounded": True,
            "operatorEnvironmentAbsent": True, "rawInputsAbsent": True,
            "releaseIdentityVerified": True, "serviceStarted": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--expected-commit", required=True)
    args = parser.parse_args()
    try:
        result = verify(args.reference, args.expected_commit)
    except (ValueError, KeyError, OSError, tarfile.TarError):
        parser.exit(1, "Web release verification failed; no files were extracted.\n")
    print(json.dumps(result, ensure_ascii=False))
