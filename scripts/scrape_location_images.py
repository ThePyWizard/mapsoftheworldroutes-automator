#!/usr/bin/env python3
"""
For every route in routes.json, fetch a representative image URL for each
location (origin + waypoints + destination) from Wikipedia and write them
back as a `locationImages` array in the same order as the points.

Usage:
    python scripts/scrape_location_images.py            # all routes
    python scripts/scrape_location_images.py 46 47 48   # only these ids
    python scripts/scrape_location_images.py --missing  # only routes without locationImages

Requires: requests  (pip install requests)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Optional

import requests

ROUTES_FILE = Path(__file__).resolve().parent.parent / "routes.json"
USER_AGENT = "MapsOfTheWorldRoutes/1.0 (varsha@lascade.com)"
SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
SEARCH_URL = "https://en.wikipedia.org/w/api.php"
REQUEST_DELAY = 0.2  # seconds between requests — be polite to Wikipedia

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})


def fetch_summary_image(title: str) -> Optional[str]:
    encoded = urllib.parse.quote(title.replace(" ", "_"), safe="")
    url = SUMMARY_URL.format(title=encoded)
    try:
        r = session.get(url, timeout=10)
    except requests.RequestException as e:
        print(f"    summary error for {title!r}: {e}")
        return None
    if r.status_code != 200:
        return None
    data = r.json()
    return (
        (data.get("originalimage") or {}).get("source")
        or (data.get("thumbnail") or {}).get("source")
    )


def search_page_title(query: str) -> Optional[str]:
    params = {
        "action": "opensearch",
        "search": query,
        "limit": 1,
        "format": "json",
    }
    try:
        r = session.get(SEARCH_URL, params=params, timeout=10)
    except requests.RequestException as e:
        print(f"    search error for {query!r}: {e}")
        return None
    if r.status_code != 200:
        return None
    data = r.json()
    titles = data[1] if len(data) > 1 else []
    return titles[0] if titles else None


def find_image(location: str) -> Optional[str]:
    """Try the full name, then the name without a state/country suffix,
    then fall back to MediaWiki opensearch."""
    candidates = [location]
    if "," in location:
        candidates.append(location.split(",")[0].strip())

    for cand in candidates:
        img = fetch_summary_image(cand)
        if img:
            return img
        time.sleep(REQUEST_DELAY)

    title = search_page_title(location)
    if title:
        return fetch_summary_image(title)
    return None


def ordered_points(route: dict) -> list[str]:
    return [route["origin"], *route.get("waypoints", []), route["destination"]]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument(
        "ids",
        nargs="*",
        type=int,
        help="Optional route ids to process. Omit to process all.",
    )
    p.add_argument(
        "--missing",
        action="store_true",
        help="Only process routes that don't already have locationImages set.",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    data = json.loads(ROUTES_FILE.read_text(encoding="utf-8"))

    for route in data:
        if args.ids and route["id"] not in args.ids:
            continue
        if args.missing and route.get("locationImages"):
            continue

        print(f"\n[{route['id']}] {route['title']}")
        images: list[Optional[str]] = []
        for loc in ordered_points(route):
            img = find_image(loc)
            print(f"  {loc} -> {img or '(not found)'}")
            images.append(img)
            time.sleep(REQUEST_DELAY)
        route["locationImages"] = images

    ROUTES_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"\nWrote {ROUTES_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
