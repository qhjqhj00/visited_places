import type { City } from '../types';

/**
 * Famous islands / regions people search for but that aren't findable cities in
 * GeoNames cities15000 (Bali, Santorini…), or whose only city has a poor/uncommon
 * Chinese name (Phuket→布吉市, Jeju→濟州, Maldives→瑪律). Each becomes a searchable
 * "destination" pinned to a representative spot; `alias` terms feed the search
 * index so the zh name, en name and the main city's names all resolve here.
 *
 * Order is stable — destination ids are derived from the array index (negative,
 * so they never collide with GeoNames ids), and saved maps reference those ids.
 */
interface DestDef {
  en: string;
  zh: string;
  cc: string;
  lat: number;
  lng: number;
  alias: string; // extra space-separated search terms (zh variants + en + nearby cities)
}

export const DESTINATIONS: DestDef[] = [
  { en: 'Bali', zh: '巴厘岛', cc: 'ID', lat: -8.45, lng: 115.18, alias: '巴厘 登巴萨 Denpasar Kuta Ubud Seminyak Nusa' },
  { en: 'Phuket', zh: '普吉岛', cc: 'TH', lat: 7.88, lng: 98.39, alias: '普吉 布吉 Patong' },
  { en: 'Koh Samui', zh: '苏梅岛', cc: 'TH', lat: 9.51, lng: 100.01, alias: '苏梅 Samui' },
  { en: 'Jeju', zh: '济州岛', cc: 'KR', lat: 33.43, lng: 126.55, alias: '济州 濟州 Jeju Cheju' },
  { en: 'Okinawa', zh: '冲绳', cc: 'JP', lat: 26.21, lng: 127.68, alias: '冲绳 沖縄 Naha 那霸 那覇' },
  { en: 'Santorini', zh: '圣托里尼', cc: 'GR', lat: 36.39, lng: 25.46, alias: 'Santorini Thira Oia Fira' },
  { en: 'Boracay', zh: '长滩岛', cc: 'PH', lat: 11.97, lng: 121.92, alias: '长滩 Boracay' },
  { en: 'Maldives', zh: '马尔代夫', cc: 'MV', lat: 4.17, lng: 73.51, alias: '马尔代夫 马累 Male Malé' },
  { en: 'Hawaii', zh: '夏威夷', cc: 'US', lat: 21.31, lng: -157.86, alias: '夏威夷 Hawaii Honolulu 檀香山 Maui' },
  { en: 'Tahiti', zh: '大溪地', cc: 'PF', lat: -17.65, lng: -149.43, alias: '大溪地 塔希提 Tahiti Papeete Bora' },
  { en: 'Saipan', zh: '塞班岛', cc: 'MP', lat: 15.18, lng: 145.75, alias: '塞班 Saipan' },
  { en: 'Guam', zh: '关岛', cc: 'GU', lat: 13.44, lng: 144.79, alias: '关岛 Guam' },
  { en: 'Langkawi', zh: '兰卡威', cc: 'MY', lat: 6.35, lng: 99.8, alias: '兰卡威 Langkawi' },
  { en: 'Mauritius', zh: '毛里求斯', cc: 'MU', lat: -20.28, lng: 57.55, alias: '毛里求斯 Mauritius Louis' },
  { en: 'Fiji', zh: '斐济', cc: 'FJ', lat: -18.14, lng: 178.44, alias: '斐济 Fiji Suva Nadi' },
  { en: 'Phu Quoc', zh: '富国岛', cc: 'VN', lat: 10.23, lng: 103.96, alias: '富国 Quoc' },
  { en: 'Sicily', zh: '西西里岛', cc: 'IT', lat: 37.6, lng: 14.0, alias: '西西里 Sicily Sicilia Palermo Catania' },
  { en: 'Cappadocia', zh: '卡帕多奇亚', cc: 'TR', lat: 38.65, lng: 34.83, alias: '卡帕多奇亚 Cappadocia Goreme' },
];

let cache: { cities: City[]; aliasById: Map<number, string> } | null = null;

/**
 * Build destination City objects, inheriting ccn/country/continent from the most
 * prominent real city of the same country so map fills, stats and grouping work.
 * Returns the cities plus a map of id → alias terms for the search index.
 */
export function buildDestinations(byCc: Map<string, City>): {
  cities: City[];
  aliasById: Map<number, string>;
} {
  if (cache) return cache;
  const cities: City[] = [];
  const aliasById = new Map<number, string>();
  DESTINATIONS.forEach((d, i) => {
    const ref = byCc.get(d.cc);
    if (!ref) return; // no country data → skip (keeps index-based id stable)
    const id = -(i + 1);
    cities.push({
      id,
      en: d.en,
      zh: d.zh,
      country: ref.country,
      cc: d.cc,
      ccn: ref.ccn,
      cont: ref.cont,
      lat: d.lat,
      lng: d.lng,
      pop: 0,
      prom: 6, // rank reasonably in search and as a map dot
      fcode: 'DEST',
      adm1: 'DEST-' + d.en, // its own province-dot in the global view
    });
    aliasById.set(id, `${d.zh} ${d.en} ${d.alias}`);
  });
  cache = { cities, aliasById };
  return cache;
}
