import { normalizeAddress } from "../address/match";
// Only this finite province table may change a road-address token. District,
// road, building number and reference text remain exact after whitespace folding.
const provinces: Record<string, string> = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
};
const fullNames = new Set([...Object.values(provinces), "전남광주통합특별시"]);
export function normalizeStagedRoad(value: string) {
  const [province, ...rest] = normalizeAddress(value).split(" ");
  return [
    Object.hasOwn(provinces, province) ? provinces[province] : province,
    ...rest,
  ].join(" ");
}
export function validStagedRoad(value: string) {
  const [province, ...rest] = normalizeStagedRoad(value).split(" ");
  if (!fullNames.has(province)) return false;
  const road = rest.join(" ");
  return (
    /^(?:\S+(?:시|군|구|읍|면) ){1,3}\S+[로길] \d+(?:-\d+)?$/.test(road) ||
    (province === "세종특별자치시" && /^\S+[로길] \d+(?:-\d+)?$/.test(road))
  );
}
