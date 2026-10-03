"""Security and identity checks for downloaded archives; no service is launched."""
import hashlib
import io
import json
import runpy
import tarfile
import tempfile
import unittest
from pathlib import Path

verify = runpy.run_path(str(Path(__file__).with_name("verify-web-archive.py")))["verify"]
COMMIT = "a" * 40


class ArchiveVerificationTests(unittest.TestCase):
    def fixture(self, extra=(), mutate=None):
        # Retain these tiny synthetic fixtures for inspection; no source is deleted.
        root = Path(tempfile.mkdtemp(prefix="studysolo-release-verifier-"))
        payload = {
            "server.js": b"synthetic", ".next/BUILD_ID": b"synthetic-build",
            "node_modules/.pnpm/next/node_modules/next/package.json": b"{}",
            "runtime/search-worker/search/worker/index.mjs": b"synthetic",
            "content/.index/manifest.json": b"{}",
            "lib/sandbox/skill-packs/catalog.json": b"{}",
        }
        metadata = {"schemaVersion": 1, "product": "StudySolo", "target": "linux-amd64-web",
                    "commit": COMMIT, "version": "synthetic", "buildId": "synthetic-build",
                    "files": len(payload), "bytes": sum(map(len, payload.values())),
                    "operatorEnvironmentIncluded": False, "serviceStarted": False}
        payload["studysolo-release.json"] = json.dumps(metadata).encode()
        payload["public/studysolo-release.json"] = json.dumps({k: metadata[k] for k in
            ("schemaVersion", "product", "target", "commit", "version", "buildId")}).encode()
        if mutate:
            mutate(payload, metadata)
        archive = root / ("studysolo-web-" + COMMIT + ".tar.gz")
        with tarfile.open(archive, "w:gz") as tar:
            for name, content in payload.items():
                info = tarfile.TarInfo(name)
                info.size = len(content)
                tar.addfile(info, io.BytesIO(content))
            link = tarfile.TarInfo("node_modules/next")
            link.type = tarfile.SYMTYPE
            link.linkname = ".pnpm/next/node_modules/next"
            tar.addfile(link)
            directory = tarfile.TarInfo("node_modules/.pnpm/next/node_modules/next")
            directory.type = tarfile.DIRTYPE
            tar.addfile(directory)
            for entry in extra:
                tar.addfile(entry, io.BytesIO(b"x") if entry.isfile() else None)
        metadata["archiveSha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
        reference = root / "release-reference.json"
        reference.write_text(json.dumps(metadata), encoding="utf-8")
        return reference

    def rejected(self, code, extra=(), mutate=None):
        with self.assertRaisesRegex(ValueError, code):
            verify(self.fixture(extra, mutate), COMMIT)

    def test_clean_pnpm_directory_link_and_identity(self):
        report = verify(self.fixture(), COMMIT)
        self.assertTrue(report["releaseIdentityVerified"])
        self.assertFalse(report["serviceStarted"])

    def test_wrong_expected_commit(self):
        with self.assertRaisesRegex(ValueError, "release_commit_mismatch"):
            verify(self.fixture(), "b" * 40)

    def test_wrong_hash(self):
        reference = self.fixture()
        metadata = json.loads(reference.read_text())
        metadata["archiveSha256"] = "0" * 64
        reference.write_text(json.dumps(metadata))
        with self.assertRaisesRegex(ValueError, "archive_hash_mismatch"):
            verify(reference, COMMIT)

    def test_private_environment_file(self):
        self.rejected("archive_private_file_forbidden", [tarfile.TarInfo(".env.production")])

    def test_raw_inputs(self):
        self.rejected("archive_private_file_forbidden", [tarfile.TarInfo("content/_raw/source.txt")])

    def test_parent_and_absolute_paths(self):
        for name in ("../escape", "/escape", "folder/../../escape"):
            with self.subTest(name=name):
                self.rejected("archive_path_outside", [tarfile.TarInfo(name)])

    def test_windows_drive_and_backslash(self):
        for name in ("C:/escape", "folder\\escape"):
            with self.subTest(name=name):
                self.rejected("archive_path_invalid", [tarfile.TarInfo(name)])

    def test_special_file_and_hardlink(self):
        for kind in (tarfile.CHRTYPE, tarfile.FIFOTYPE, tarfile.LNKTYPE):
            info = tarfile.TarInfo("unsafe")
            info.type = kind
            info.linkname = "server.js"
            self.rejected("archive_special_file", [info])

    def test_symlink_escape(self):
        link = tarfile.TarInfo("unsafe")
        link.type, link.linkname = tarfile.SYMTYPE, "../escape"
        self.rejected("archive_link_outside", [link])

    def test_symlink_cycle(self):
        link = tarfile.TarInfo("unsafe")
        link.type, link.linkname = tarfile.SYMTYPE, "unsafe"
        self.rejected("archive_link_cycle", [link])

    def test_member_cannot_write_through_link_ancestor(self):
        self.rejected("archive_symlink_ancestor", [tarfile.TarInfo("node_modules/next/injected")])

    def test_duplicate_member(self):
        self.rejected("archive_duplicate_member", [tarfile.TarInfo("server.js")])

    def test_marker_mismatch(self):
        self.rejected("release_public_marker_mismatch", mutate=lambda payload, _: payload.update({
            "public/studysolo-release.json": b"{}"}))

    def test_file_count_mismatch(self):
        def mutate(payload, metadata):
            metadata["files"] += 1
            payload["studysolo-release.json"] = json.dumps(metadata).encode()
        self.rejected("archive_file_count_mismatch", mutate=mutate)


if __name__ == "__main__":
    unittest.main()
