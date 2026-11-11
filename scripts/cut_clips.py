#!/usr/bin/env python3
"""Cut a short clip around each shot moment from the confidential match video.

Reads data/moments.json (from extract_moments.py) and writes data/clips/<id>.mp4,
both gitignored. The footage is confidential: clips stay local, never in git,
never in anything public.

    python3 scripts/cut_clips.py --video /path/to/match-video.mp4

Alignment: video time = event Timestamp - video.file_start_utc - video.offset_s,
both from the gitignored scripts/moments_config.local.json.
Each clip starts 8 s before the shot and runs 5 s after it.
"""
import argparse
import datetime
import json
import os
import subprocess
import sys

PRE_S, POST_S = 8, 5
CONFIG = os.path.join(os.path.dirname(__file__), "moments_config.local.json")

def load_video_alignment():
    """Return (file start as UTC epoch seconds, offset in seconds) from the local config."""
    try:
        with open(CONFIG, encoding="utf-8") as f:
            video = json.load(f)["video"]
        start = datetime.datetime.fromisoformat(video["file_start_utc"].replace("Z", "+00:00"))
        return start.timestamp(), video["offset_s"]
    except FileNotFoundError:
        sys.exit(f"Missing {CONFIG}. Copy moments_config.example.json to it and fill in the video block.")
    except KeyError as e:
        sys.exit(f"{CONFIG} has no video.{e.args[0]} entry. See moments_config.example.json.")
    except (ValueError, json.JSONDecodeError) as e:
        sys.exit(f"{CONFIG}: {e}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default=os.environ.get("THINKSPORT_MATCH_VIDEO"))
    args = ap.parse_args()
    if not args.video or not os.path.isfile(args.video):
        sys.exit("Give the match video with --video or THINKSPORT_MATCH_VIDEO (it must live outside this repo).")
    file_start_utc, offset_s = load_video_alignment()
    root = os.path.join(os.path.dirname(__file__), "..")
    with open(os.path.join(root, "data", "moments.json"), encoding="utf-8") as f:
        moments = json.load(f)["moments"]
    out_dir = os.path.join(root, "data", "clips")
    os.makedirs(out_dir, exist_ok=True)
    for m in moments:
        if m["event"] != "Shot" or not m.get("timestamp_ms"):
            continue
        t = m["timestamp_ms"] / 1000 - file_start_utc - offset_s
        out = os.path.join(out_dir, f"{m['id']}.mp4")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t - PRE_S:.2f}", "-i", args.video,
                        "-t", str(PRE_S + POST_S), "-vf", "scale=960:-2", "-c:v", "libx264", "-preset", "veryfast",
                        "-crf", "26", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out], check=True)
        print(f"{m['id']}: video {int(t // 60)}:{t % 60:04.1f} -> {out}")

if __name__ == "__main__":
    main()
