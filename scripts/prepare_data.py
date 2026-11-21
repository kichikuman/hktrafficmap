"""Download official MTR and traffic-camera data and write static map files.

Station positions come from the Lands Department 3D indoor MTR station map.
That service does not allow browser reads, so the coordinates are saved here.
"""

from __future__ import annotations

import csv
import io
import json
import math
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "src" / "data"

LINES = [
    ("ISL", "港島綫", "#007DC5"),
    ("TWL", "荃灣綫", "#E2231A"),
    ("KTL", "觀塘綫", "#00AB4E"),
    ("TKL", "將軍澳綫", "#7D499D"),
    ("EAL", "東鐵綫", "#5EB6E4"),
    ("TML", "屯馬綫", "#9A3B26"),
    ("TCL", "東涌綫", "#F7943E"),
    ("AEL", "機場快綫", "#1C7670"),
    ("SIL", "南港島綫", "#C5D100"),
    ("DRL", "迪士尼綫", "#F550A6"),
]
LINE_ORDER = {code: index for index, (code, _, _) in enumerate(LINES)}
SHIFT = 0.00018


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "hk-smart-map/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def norm_name(value: str) -> str:
    return value.replace("鐵路站", "").replace("站", "").replace("荔", "茘").strip()


def pairs(codes: list[str]) -> list[tuple[str, str]]:
    return list(zip(codes, codes[1:]))


def round_coord(lon: float, lat: float) -> list[float]:
    return [round(lon, 6), round(lat, 6)]


def closest_on_segment(
    start: list[float], end: list[float], point: list[float]
) -> tuple[list[float], float]:
    ax, ay = start
    bx, by = end
    px, py = point
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    ratio = 0.0 if denom == 0 else ((px - ax) * dx + (py - ay) * dy) / denom
    ratio = max(0.0, min(1.0, ratio))
    return [ax + dx * ratio, ay + dy * ratio], ratio


def fan(start: list[float], end: list[float], shift: float) -> list[list[float]]:
    ax, ay = start
    bx, by = end
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy) or 1.0
    px, py = -dy / length, dx / length
    if abs(shift) < 1e-12:
        return [start, end]

    def point(ratio: float) -> list[float]:
        return round_coord(ax + dx * ratio + px * shift, ay + dy * ratio + py * shift)

    return [start, point(0.22), point(0.78), end]


def main() -> None:
    station_rows = [
        row
        for row in csv.DictReader(
            io.StringIO(fetch("https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv").decode("utf-8-sig"))
        )
        if row.get("Line Code")
    ]
    venues = json.loads(
        fetch(
            "https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/mtr_venue_polygon?service=WFS&version=1.1.0&request=GetFeature&outputFormat=application/json"
        )
    )
    coordinates: dict[str, list[float]] = {}
    for feature in venues["features"]:
        props = feature["properties"]
        west, south, east, north = props["bbox"]
        coordinates[norm_name(props["venue_name_zh"])] = round_coord((west + east) / 2, (south + north) / 2)

    sequences: dict[str, dict[str, list[str]]] = defaultdict(dict)
    stations: dict[str, dict[str, object]] = {}
    for row in station_rows:
        code = row["Station Code"]
        line = row["Line Code"]
        sequences[line].setdefault(row["Direction"], []).append((float(row["Sequence"]), code))
        station = stations.setdefault(
            code,
            {
                "code": code,
                "nameZh": row["Chinese Name"],
                "nameEn": row["English Name"],
                "lines": [],
            },
        )
        lines = station["lines"]
        assert isinstance(lines, list)
        if line not in lines:
            lines.append(line)

    ordered_sequences = {
        line: {
            direction: [code for _, code in sorted(items)]
            for direction, items in directions.items()
        }
        for line, directions in sequences.items()
    }

    racecourse = coordinates["馬場"]
    stations["RAC"] = {
        "code": "RAC",
        "nameZh": "馬場",
        "nameEn": "Racecourse",
        "lines": ["EAL"],
    }
    coordinates["馬場"] = racecourse

    paths: dict[str, list[list[str]]] = {}
    edge_users: dict[tuple[str, str], list[str]] = defaultdict(list)
    for code, _, _ in LINES:
        directions = ordered_sequences[code]
        if "DT" not in directions:
            raise SystemExit(f"{code} 沒有下行站序")
        main = directions["DT"]
        line_paths = [main]
        seen: set[tuple[str, str]] = set()
        for start, end in pairs(main):
            key = tuple(sorted((start, end)))
            seen.add(key)
            if code not in edge_users[key]:
                edge_users[key].append(code)
        for direction, sequence in directions.items():
            if direction == "DT":
                continue
            current: list[str] = []
            for start, end in pairs(sequence):
                key = tuple(sorted((start, end)))
                if key in seen:
                    if len(current) >= 2:
                        line_paths.append(current)
                    current = []
                    continue
                seen.add(key)
                if code not in edge_users[key]:
                    edge_users[key].append(code)
                if not current:
                    current = [start, end]
                elif current[-1] == start:
                    current.append(end)
                else:
                    if len(current) >= 2:
                        line_paths.append(current)
                    current = [start, end]
            if len(current) >= 2:
                line_paths.append(current)
        paths[code] = line_paths

    station_coords: dict[str, list[float]] = {}
    for code, station in stations.items():
        name = str(station["nameZh"])
        if name not in coordinates:
            raise SystemExit(f"找不到車站座標：{name}")
        station_coords[code] = coordinates[name]
        lon, lat = station_coords[code]
        if not (113.8 <= lon <= 114.5 and 22.15 <= lat <= 22.58):
            raise SystemExit(f"車站座標超出香港範圍：{name} {lon}, {lat}")

    def path_coordinates(line: str, path: list[str]) -> list[list[float]]:
        points: list[list[float]] = []
        for start, end in pairs(path):
            key = tuple(sorted((start, end)))
            users = edge_users[key]
            shift = 0.0
            if len(users) > 1:
                shift = (users.index(line) - (len(users) - 1) / 2) * SHIFT
            segment = fan(station_coords[start], station_coords[end], shift)
            points.extend(segment if not points else segment[1:])
        return points

    line_features = []
    for code, name, color in LINES:
        parts = [path_coordinates(code, path) for path in paths[code]]
        if code == "EAL":
            junction, ratio = closest_on_segment(
                station_coords["FOT"], station_coords["SHT"], station_coords["RAC"]
            )
            if ratio < 0.08:
                junction = station_coords["FOT"]
            elif ratio > 0.92:
                junction = station_coords["SHT"]
            parts.append([round_coord(*junction), station_coords["RAC"]])
        line_features.append(
            {
                "code": code,
                "nameZh": name,
                "color": color,
                "coordinates": parts,
            }
        )

    neighbors: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for code, _, _ in LINES:
        for path in paths[code]:
            for start, end in pairs(path):
                neighbors[code][start].add(end)
                neighbors[code][end].add(start)
    neighbors["EAL"]["RAC"].add("FOT")

    terminus: dict[str, set[str]] = defaultdict(set)
    for line, linked in neighbors.items():
        for station, linked_stations in linked.items():
            if len(linked_stations) == 1:
                terminus[station].add(line)

    station_list = []
    for code, station in stations.items():
        lines = sorted(station["lines"], key=lambda item: LINE_ORDER[str(item)])
        lon, lat = station_coords[code]
        station_list.append(
            {
                "code": code,
                "nameZh": station["nameZh"],
                "nameEn": station["nameEn"],
                "lon": lon,
                "lat": lat,
                "lines": lines,
                "terminusLines": sorted(terminus[code], key=lambda item: LINE_ORDER[item]),
            }
        )
    station_list.sort(key=lambda item: (item["nameZh"], item["code"]))

    camera_text = fetch(
        "https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.csv"
    ).decode("utf-16").lstrip("\ufeff")
    cameras = []
    seen_keys: set[str] = set()
    for row in csv.DictReader(io.StringIO(camera_text), delimiter="\t"):
        key = row["key"].strip()
        if key in seen_keys:
            raise SystemExit(f"快拍點編號重複：{key}")
        seen_keys.add(key)
        lon = float(row["longitude"])
        lat = float(row["latitude"])
        if not (113.8 <= lon <= 114.5 and 22.15 <= lat <= 22.58):
            raise SystemExit(f"快拍點座標超出香港範圍：{key}")
        description = row["description"].strip()
        suffix = f"[{key}]"
        if description.endswith(suffix):
            description = description[: -len(suffix)].strip()
        cameras.append(
            {
                "key": key,
                "region": row["region"].strip(),
                "district": row["district"].strip(),
                "description": description,
                "lon": round(lon, 6),
                "lat": round(lat, 6),
                "url": row["url"].strip(),
            }
        )

    if len(station_list) != 98:
        raise SystemExit(f"車站數目應為 98，實際 {len(station_list)}")
    if len(cameras) != 1013:
        raise SystemExit(f"快拍點數目應為 1013，實際 {len(cameras)}")
    if not any(station["code"] == "RAC" and "EAL" in station["terminusLines"] for station in station_list):
        raise SystemExit("馬場站沒有標成東鐵綫終點")

    covered: dict[str, set[str]] = defaultdict(set)
    for feature in line_features:
        for part in feature["coordinates"]:
            if len(part) < 2:
                raise SystemExit(f"{feature['code']} 有過短的路段")
        for path in paths[feature["code"]]:
            covered[feature["code"]].update(path)
    covered["EAL"].add("RAC")
    for station in station_list:
        for line in station["lines"]:
            if station["code"] not in covered[line]:
                raise SystemExit(f"{station['nameZh']} 沒有畫進 {line}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "network.json").write_text(
        json.dumps({"stations": station_list, "lines": line_features}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    (OUT_DIR / "cameras.json").write_text(
        json.dumps(cameras, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    shared = {key: users for key, users in edge_users.items() if len(users) > 1}
    print(f"stations {len(station_list)} cameras {len(cameras)} shared edges {len(shared)}")
    for key, users in sorted(shared.items()):
        print(f"  {key[0]}-{key[1]}: {', '.join(users)}")


if __name__ == "__main__":
    main()
