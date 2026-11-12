// Natural Earth(퍼블릭 도메인) 육지 데이터 → GeoJSON 변환
// 출처: npm world-atlas@2.0.2 (ISC, Natural Earth 1:50m land 재배포)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { feature } from 'topojson-client';

const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/land-50m.json', import.meta.url)));
const land = feature(topo, topo.objects.land);
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/land-50m.geojson', import.meta.url), JSON.stringify(land));
const polys = land.features.reduce((n, f) => n + (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.length : 1), 0);
console.log(`land features: ${land.features.length}, polygons: ${polys}`);
