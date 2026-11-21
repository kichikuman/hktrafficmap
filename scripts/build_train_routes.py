"""Build the station paths used to place train icons.

Reads the committed network geometry and the official station order.
Does not call the next-train feed.
"""

from __future__ import annotations

import csv
import heapq
import io
import json
import math
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NETWORK = ROOT / "src" / "data" / "network.json"
OUT = ROOT / "src" / "data" / "train-routes.json"
KM_PER_MINUTE = 0.75
LINK_KM = 0.04
WINDOW = {
    "ISL": 6,
    "TWL": 6,
    "KTL": 6,
    "TKL": 6,
    "TML": 12,
    "EAL": 10,
    "TCL": 10,
    "AEL": 10,
    "SIL": 30,
    "DRL": 30,
}


def fetch_rows() -> list[dict[str, str]]:
    request = urllib.request.Request(
        "https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv",
        headers={"User-Agent": "hk-smart-map/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        text = response.read().decode("utf-8-sig")
    return [row for row in csv.DictReader(io.StringIO(text)) if row["Line Code"] and row["Sequence"]]


def kilometres(start: list[float], end: list[float]) -> float:
    lon1, lat1 = start
    lon2, lat2 = end
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    height = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(height))


def minutes_for(distance: float) -> int:
    return max(1, round(distance / KM_PER_MINUTE))


def simplify(points: list[list[float]], tolerance: float = 0.00005) -> list[list[float]]:
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    limit = tolerance * tolerance
    while stack:
        start, end = stack.pop()
        ax, ay = points[start]
        bx, by = points[end]
        dx, dy = bx - ax, by - ay
        denom = dx * dx + dy * dy
        farthest = -1.0
        index = None
        for position in range(start + 1, end):
            px, py = points[position]
            if denom == 0:
                distance = (px - ax) ** 2 + (py - ay) ** 2
            else:
                ratio = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / denom))
                qx, qy = ax + ratio * dx, ay + ratio * dy
                distance = (px - qx) ** 2 + (py - qy) ** 2
            if distance > farthest:
                farthest = distance
                index = position
        if index is not None and farthest > limit:
            keep[index] = True
            stack.append((start, index))
            stack.append((index, end))
    return [point for point, flagged in zip(points, keep) if flagged]


def route_table(rows: list[dict[str, str]]) -> dict[str, list[list[str]]]:
    grouped: dict[str, dict[str, list[tuple[float, str]]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        grouped[row["Line Code"]][row["Direction"]].append((float(row["Sequence"]), row["Station Code"]))
    routes: dict[str, list[list[str]]] = {}
    for line, directions in grouped.items():
        chosen: list[list[str]] = []
        seen: set[tuple[str, ...]] = set()
        for direction, items in directions.items():
            if direction.endswith("DT"):
                continue
            stations = [code for _, code in sorted(items)]
            key = tuple(stations)
            if key not in seen:
                seen.add(key)
                chosen.append(stations)
        if line == "TKL":
            main = next(item for item in chosen if item[-1] == "POA")
            branch = next(item for item in chosen if "LHP" in item)
            join = main.index(branch[0])
            full = main[: join + 1] + branch[1:]
            if full not in chosen:
                chosen.append(full)
            chosen = [item for item in chosen if item == main or item == full]
        if line == "EAL":
            main = next(item for item in chosen if item[0] == "ADM" and item[-1] == "LOW")
            racecourse = []
            for code in main:
                racecourse.append(code)
                if code == "FOT":
                    racecourse.append("RAC")
            chosen.append(racecourse)
        routes[line] = chosen
    return routes


def build_graph(parts: list[list[list[float]]]) -> tuple[list[list[float]], dict[int, list[tuple[int, float]]]]:
    nodes: list[list[float]] = []
    index: dict[tuple[float, float], int] = {}
    edges: dict[int, list[tuple[int, float]]] = defaultdict(list)

    def node_id(point: list[float]) -> int:
        key = (round(point[0], 5), round(point[1], 5))
        found = index.get(key)
        if found is None:
            found = len(nodes)
            index[key] = found
            nodes.append([key[0], key[1]])
        return found

    def link(start: int, end: int) -> None:
        if start == end:
            return
        weight = kilometres(nodes[start], nodes[end])
        edges[start].append((end, weight))
        edges[end].append((start, weight))

    for part in parts:
        ids = [node_id(point) for point in part]
        for start, end in zip(ids, ids[1:]):
            link(start, end)
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    for current, point in enumerate(nodes):
        buckets[(round(point[0] / LINK_KM * 111), round(point[1] / LINK_KM * 111))].append(current)
    for current, point in enumerate(nodes):
        cell_x = round(point[0] / LINK_KM * 111)
        cell_y = round(point[1] / LINK_KM * 111)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other in buckets.get((cell_x + dx, cell_y + dy), []):
                    if other <= current:
                        continue
                    if kilometres(point, nodes[other]) <= LINK_KM:
                        link(current, other)
    return nodes, edges


def attach(
    nodes: list[list[float]],
    edges: dict[int, list[tuple[int, float]]],
    point: list[float],
) -> int:
    best_gap = math.inf
    best: tuple[int, int, float, list[float]] | None = None
    seen: set[tuple[int, int]] = set()
    for start, neighbours in edges.items():
        for end, _weight in neighbours:
            key = (start, end) if start < end else (end, start)
            if key in seen:
                continue
            seen.add(key)
            ax, ay = nodes[start]
            bx, by = nodes[end]
            dx, dy = bx - ax, by - ay
            denom = dx * dx + dy * dy
            ratio = 0.0 if denom == 0 else max(0.0, min(1.0, ((point[0] - ax) * dx + (point[1] - ay) * dy) / denom))
            projected = [ax + ratio * dx, ay + ratio * dy]
            gap = kilometres(projected, point)
            if gap < best_gap:
                best_gap = gap
                best = (start, end, ratio, projected)
    if best is None:
        raise SystemExit("路軌是空的")
    start, end, ratio, projected = best
    if ratio <= 0.001:
        return start
    if ratio >= 0.999:
        return end
    added = len(nodes)
    nodes.append(projected)
    for origin in (start, end):
        weight = kilometres(nodes[origin], projected)
        edges[origin].append((added, weight))
        edges[added].append((origin, weight))
    return added


def shortest(edges: dict[int, list[tuple[int, float]]], start: int, end: int) -> list[int] | None:
    if start == end:
        return [start]
    heap = [(0.0, start)]
    cost = {start: 0.0}
    previous: dict[int, int] = {}
    while heap:
        weight, current = heapq.heappop(heap)
        if current == end:
            break
        if weight > cost.get(current, math.inf):
            continue
        for nxt, step in edges.get(current, []):
            total = weight + step
            if total < cost.get(nxt, math.inf):
                cost[nxt] = total
                previous[nxt] = current
                heapq.heappush(heap, (total, nxt))
    if end not in cost:
        return None
    path = [end]
    while path[-1] != start:
        path.append(previous[path[-1]])
    path.reverse()
    return path


def choose_samples(stations: list[str], minutes: dict[tuple[str, str], int], window: int) -> list[str]:
    cumulative = [0]
    for start, end in zip(stations, stations[1:]):
        cumulative.append(cumulative[-1] + minutes[(start, end)])
    if cumulative[-1] <= window:
        return [stations[len(stations) // 2]]
    chosen = [stations[0]]
    last = 0
    for index in range(1, len(stations)):
        if cumulative[index] - cumulative[last] <= window:
            continue
        if index - 1 != last:
            chosen.append(stations[index - 1])
            last = index - 1
        if cumulative[index] - cumulative[last] > window and stations[index] not in chosen:
            chosen.append(stations[index])
            last = index
    if cumulative[-1] - cumulative[last] > window and stations[-1] not in chosen:
        chosen.append(stations[-1])
    return chosen


def main() -> None:
    network = json.loads(NETWORK.read_text())
    stations = {station["code"]: station for station in network["stations"]}
    lines = {line["code"]: line for line in network["lines"]}
    routes = route_table(fetch_rows())
    output: dict[str, object] = {"lines": {}}
    sample_count = 0
    for code, _, _ in [
        ("ISL", "", ""),
        ("TWL", "", ""),
        ("KTL", "", ""),
        ("TKL", "", ""),
        ("EAL", "", ""),
        ("TML", "", ""),
        ("TCL", "", ""),
        ("AEL", "", ""),
        ("SIL", "", ""),
        ("DRL", "", ""),
    ]:
        line = lines[code]
        nodes, edges = build_graph(line["coordinates"])
        ordered_stations: list[str] = []
        seen_stations: set[str] = set()
        for route in routes[code]:
            for station in route:
                if station not in seen_stations:
                    seen_stations.add(station)
                    ordered_stations.append(station)
        attached = {
            station: attach(nodes, edges, [stations[station]["lon"], stations[station]["lat"]])
            for station in ordered_stations
        }
        for station, node in attached.items():
            gap = kilometres(nodes[node], [stations[station]["lon"], stations[station]["lat"]])
            if gap > 0.3:
                raise SystemExit(f"{code} {station} 離路軌 {gap:.2f} 公里")
        segments: dict[tuple[str, str], dict[str, object]] = {}
        for route in routes[code]:
            for start, end in zip(route, route[1:]):
                key = (start, end)
                if key in segments:
                    continue
                path = shortest(edges, attached[start], attached[end])
                if path is None:
                    coordinates = [
                        [stations[start]["lon"], stations[start]["lat"]],
                        [stations[end]["lon"], stations[end]["lat"]],
                    ]
                    distance = kilometres(coordinates[0], coordinates[1])
                    print(f"straight fallback {code} {start}-{end}")
                else:
                    coordinates = simplify([nodes[item] for item in path])
                    distance = sum(kilometres(a, b) for a, b in zip(coordinates, coordinates[1:]))
                    direct = kilometres(
                        [stations[start]["lon"], stations[start]["lat"]],
                        [stations[end]["lon"], stations[end]["lat"]],
                    )
                    if direct > 0.4 and distance > direct * 3:
                        print(f"detour {code} {start}-{end} path {distance:.2f} direct {direct:.2f}")
                segments[key] = {
                    "from": start,
                    "to": end,
                    "minutes": minutes_for(distance),
                    "coordinates": [[round(lon, 5), round(lat, 5)] for lon, lat in coordinates],
                }
        minute_lookup = {key: int(value["minutes"]) for key, value in segments.items()}
        samples: list[str] = []
        for route in routes[code]:
            for station in choose_samples(route, minute_lookup, WINDOW[code]):
                if station not in samples:
                    samples.append(station)
        for route in routes[code]:
            cumulative = [0]
            for start, end in zip(route, route[1:]):
                cumulative.append(cumulative[-1] + minute_lookup[(start, end)])
            for index, station in enumerate(route):
                nearest_gap = min(
                    abs(cumulative[index] - cumulative[route.index(sample)])
                    for sample in samples
                    if sample in route
                )
                if nearest_gap > WINDOW[code]:
                    raise SystemExit(f"{code} {station} 距離觀測站 {nearest_gap} 分鐘")
        sample_count += len(samples)
        output["lines"][code] = {
            "routes": routes[code],
            "segments": list(segments.values()),
            "samples": samples,
        }
        print(f"{code} routes {len(routes[code])} segments {len(segments)} samples {samples}")
    output["sampleCount"] = sample_count
    OUT.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")))
    print("samples", sample_count, "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
