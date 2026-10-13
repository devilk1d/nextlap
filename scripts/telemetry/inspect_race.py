"""Print schema and coverage of one race's raw telemetry Parquet file.

    scripts/telemetry/.venv/Scripts/python.exe scripts/telemetry/inspect_race.py <file.parquet>
"""

import sys
from collections import Counter

import pyarrow.compute as pc
import pyarrow.parquet as pq

table = pq.read_table(sys.argv[1])
print(f"rows: {table.num_rows:,}")
print()
for field in table.schema:
    print(f"{field.name:<18} {field.type}")
print()

drivers = pc.unique(table["Driver"]).to_pylist()
print("drivers:", len(drivers), sorted(d for d in drivers if d is not None))
laps = pc.unique(table["LapNumber"]).to_pylist()
print("lap numbers:", min(laps), "-", max(laps))
per = Counter(zip(table["Driver"].to_pylist(), table["LapNumber"].to_pylist()))
sizes = sorted(per.values())
print(f"driver-laps: {len(per):,} | samples per lap min/median/max: {sizes[0]}/{sizes[len(sizes) // 2]}/{sizes[-1]}")
print()
print("first rows:")
for row in table.slice(0, 3).to_pylist():
    print(row)
