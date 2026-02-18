#!/usr/bin/env python3
"""Cleanup legacy cover objects in Backblaze B2.

This script is intentionally conservative:
- It ONLY targets legacy cover locations:
  - books_covers/user_*/book_*/cover.(webp|png|jpg|jpeg)
  - dictations/dict_*/cover.(webp|png|jpg|jpeg)
- It does NOT touch:
  - books_covers/<book_id>.webp
  - dictations_covers/<dictation_id>.webp
  - any audio files

Usage:
  python scripts/cleanup_b2_old_covers.py --dry-run
  python scripts/cleanup_b2_old_covers.py --apply --yes

Environment:
  Requires .env or env vars with:
    B2_ENABLED=true
    B2_APPLICATION_KEY_ID
    B2_APPLICATION_KEY
    B2_BUCKET_NAME
"""

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Load .env if present
env_path = project_root / ".env"
if env_path.exists():
    load_dotenv(env_path)

from helpers.b2_storage import b2_storage  # noqa: E402


LEGACY_IMAGE_EXTS = (".webp", ".png", ".jpg", ".jpeg")


def is_legacy_book_cover(remote_path: str) -> bool:
    # books_covers/user_<uid>/book_<id>/cover.webp
    if not remote_path.startswith("books_covers/user_"):
        return False
    base = remote_path.rsplit("/", 1)[-1]
    if not base.startswith("cover"):
        return False
    return remote_path.lower().endswith(LEGACY_IMAGE_EXTS)


def is_legacy_dictation_cover(remote_path: str) -> bool:
    # dictations/dict_<id>/cover.webp
    if not remote_path.startswith("dictations/dict_"):
        return False
    base = remote_path.rsplit("/", 1)[-1]
    if not base.startswith("cover"):
        return False
    return remote_path.lower().endswith(LEGACY_IMAGE_EXTS)


def iter_all_b2_file_names() -> list[str]:
    if not b2_storage.enabled or not b2_storage.bucket:
        raise RuntimeError(
            "B2 is not configured/enabled. Ensure B2_ENABLED=true and credentials are set."
        )

    names: list[str] = []
    for file_version, _folder_name in b2_storage.bucket.ls(folder_to_list="", recursive=True):
        file_name = getattr(file_version, "file_name", None)
        if not file_name:
            continue
        names.append(file_name)
    return names


def main() -> int:
    parser = argparse.ArgumentParser(description="Cleanup legacy cover objects in Backblaze B2")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print what would be deleted (default if --apply is not set)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete the matched files",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Required with --apply to confirm destructive deletion",
    )

    args = parser.parse_args()

    do_apply = bool(args.apply)
    if do_apply and not args.yes:
        print("❌ Refusing to delete without --yes")
        return 2

    if not do_apply:
        # treat as dry-run if not apply
        args.dry_run = True

    try:
        all_names = iter_all_b2_file_names()
    except Exception as exc:
        print(f"❌ ERROR: {exc}")
        return 1

    legacy = []
    for name in all_names:
        if is_legacy_book_cover(name) or is_legacy_dictation_cover(name):
            legacy.append(name)

    legacy.sort()

    print("=" * 70)
    print(f"📦 Bucket: {getattr(b2_storage, 'bucket_name', '')}")
    print(f"Mode: {'APPLY (delete)' if do_apply else 'DRY-RUN (no changes)'}")
    print("=" * 70)
    print(f"Found legacy covers to delete: {len(legacy)}")

    for name in legacy:
        print(f"- {name}")

    if not legacy:
        print("✅ Nothing to delete")
        return 0

    if not do_apply:
        print("\nℹ️  This was a dry-run. To delete run:")
        print("   python scripts/cleanup_b2_old_covers.py --apply --yes")
        return 0

    # Apply deletion
    deleted = 0
    failed = 0

    for name in legacy:
        ok = b2_storage.delete_file(name)
        if ok:
            deleted += 1
        else:
            failed += 1

    print("\n" + "=" * 70)
    print(f"Deleted: {deleted}")
    print(f"Failed:  {failed}")
    print("=" * 70)

    return 0 if failed == 0 else 3


if __name__ == "__main__":
    raise SystemExit(main())
