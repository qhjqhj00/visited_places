import type { CityData } from '../hooks/useCityData';
import type { FlightRoute } from '../hooks/useFlights';
import type { City } from '../types';

export interface ImportResult {
  routes: FlightRoute[];
  flights: number; // flight rows parsed
  unresolved: string[]; // airport names we couldn't map to a city
}

// zh-airport-name → cityId, built offline (accurate for known airports).
let airportMap: Record<string, number> | null = null;
async function loadAirportMap(): Promise<Record<string, number>> {
  if (!airportMap) {
    airportMap = await fetch('/data/airports.json')
      .then((r) => r.json())
      .catch(() => ({}));
  }
  return airportMap!;
}

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * Parse a 航旅纵横 Excel export (the "已结束" sheet of flown flights) into routes.
 * Each Chinese airport name is resolved to a city id: first via the bundled
 * airport→city map (exact), else a longest zh-name prefix fallback. Endpoints
 * that resolve to the same city (e.g. PEK↔PKX) produce no arc.
 */
export async function importVariflight(file: File, data: CityData): Promise<ImportResult> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  // the flown-flights sheet: prefer one named 已结束, else the 2nd sheet, else 1st
  const sheetName = wb.SheetNames.find((n) => n.includes('已结束')) || wb.SheetNames[1] || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('no sheet');
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // locate the header row + the 出发/到达 columns
  let depCol = -1, arrCol = -1, headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const r = rows[i].map((x) => String(x));
    const d = r.findIndex((x) => x.includes('出发') && x.includes('城市'));
    const a = r.findIndex((x) => x.includes('到达') && x.includes('城市'));
    if (d >= 0 && a >= 0) {
      headerRow = i; depCol = d; arrCol = a;
      break;
    }
  }
  if (headerRow < 0) throw new Error('找不到出发/到达城市列');

  const map = await loadAirportMap();
  // longest zh-name-prefix fallback for airports not in the bundled map
  const zhSorted = (data.all as City[])
    .filter((c) => c.zh)
    .sort((x, y) => (y.zh as string).length - (x.zh as string).length);
  const resolve = (name: string): number | null => {
    if (!name) return null;
    if (map[name] != null) return map[name];
    for (const c of zhSorted) if (name.startsWith(c.zh as string)) return c.id;
    return null;
  };

  const pairN = new Map<string, FlightRoute>();
  const unresolved = new Set<string>();
  let flights = 0;
  for (let i = headerRow + 1; i < rows.length; i++) {
    const dep = String(rows[i][depCol] ?? '').trim();
    const arr = String(rows[i][arrCol] ?? '').trim();
    if (!dep || !arr) continue;
    flights++;
    const a = resolve(dep), b = resolve(arr);
    if (a == null) unresolved.add(dep);
    if (b == null) unresolved.add(arr);
    if (a == null || b == null || a === b) continue;
    const k = key(a, b);
    const ex = pairN.get(k);
    if (ex) ex.n += 1;
    else pairN.set(k, { a, b, n: 1 });
  }

  return { routes: [...pairN.values()], flights, unresolved: [...unresolved] };
}
