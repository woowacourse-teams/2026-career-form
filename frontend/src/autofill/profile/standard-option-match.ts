import type { OptionCandidate } from "../api/types";
import {
  isStandardValueId,
  MILITARY_STATUS_OPTIONS,
  standardValueAliases,
} from "../../profile/standard-values";
import { normalizeDisplayName } from "../write/display-name";

export type StandardOptionMatch =
  | { status: "unique"; option: OptionCandidate }
  | { status: "none" }
  | { status: "ambiguous"; options: readonly OptionCandidate[] }
  | { status: "not-standard" };

export function matchStandardOption(
  value: string,
  options: readonly OptionCandidate[],
): StandardOptionMatch {
  if (!isStandardValueId(value)) return { status: "not-standard" };
  const aliases = new Set(
    standardValueAliases(value).map(normalizeDisplayName),
  );
  const matches = options.filter((option) =>
    aliases.has(normalizeDisplayName(option.displayName)),
  );
  if (matches.length === 1) return { status: "unique", option: matches[0] };
  if (matches.length === 0) return { status: "none" };
  return { status: "ambiguous", options: matches };
}

/**
 * Sites often fold military status and service type into one option such as
 * "병역필_현역(병)". Each stored status names a family of option words; a
 * served profile with an enlisted rank narrows to active-duty enlisted.
 * Only a single remaining option is returned as unique.
 */
const MILITARY_FAMILIES: Readonly<Record<string, RegExp>> = {
  "military-status:served": /병역필|군필|만기전역|만기제대/,
  "military-status:serving": /복무중|현역복무|재복무/,
  "military-status:not-served": /미필/,
  "military-status:exempt": /면제/,
  "military-status:not-applicable": /해당없음|해당사항없음|비대상/,
};
const ENLISTED_RANKS = new Set([
  "military-rank:byeongjang",
  "military-rank:sangbyeong",
  "military-rank:ilbyeong",
  "military-rank:ibyeong",
]);

const SERVICE_TYPES: Readonly<Record<string, RegExp>> = {
  현역: /현역/,
  현역병: /현역.*\(병\)|현역병/,
  상근예비역: /상근/,
  공익근무요원: /사회복무|공익/,
  전문연구요원: /전문연구/,
  산업기능요원: /산업기능/,
};

/**
 * Grading-time check: one page option carries this stored military status or
 * service type inside a composite label. The review then resolves and asks
 * the applicant to confirm the exact option.
 */
export function hasCompositeMilitaryOption(
  profileFieldKey: string | undefined,
  profileValue: string,
  options: readonly { displayName: string }[],
): boolean {
  const word =
    profileFieldKey === "military.military.militaryType"
      ? SERVICE_TYPES[profileValue.trim()]
      : profileFieldKey === "military.military.militaryStatus"
        ? MILITARY_FAMILIES[
            MILITARY_STATUS_OPTIONS.find(
              (option) =>
                option.value === profileValue ||
                option.label === profileValue.trim(),
            )?.value ?? ""
          ]
        : undefined;
  if (!word) return false;
  const compact = (text: string) =>
    normalizeDisplayName(text).replace(/\s+/g, "");
  // Only a composite option set: a plain option named like the value is
  // matched (or left ambiguous) by the ordinary exact check.
  const plainNames = new Set(
    [
      profileValue,
      ...(isStandardValueId(profileValue)
        ? standardValueAliases(profileValue)
        : []),
    ].map(compact),
  );
  if (options.some((option) => plainNames.has(compact(option.displayName))))
    return false;
  return options.some((option) => word.test(compact(option.displayName)));
}

export function matchCompositeMilitaryOption(
  status: string,
  rank: string | undefined,
  options: readonly OptionCandidate[],
  serviceType?: string,
): StandardOptionMatch {
  const family = MILITARY_FAMILIES[status];
  if (!family) return { status: "not-standard" };
  const compact = (option: OptionCandidate) =>
    option.displayName.normalize("NFKC").replace(/\s+/g, "");
  let matches = options.filter((option) => family.test(compact(option)));
  const typeWord = serviceType ? SERVICE_TYPES[serviceType] : undefined;
  // Service type and rank narrow only options that name them; a plain
  // discharge option carries neither and cannot contradict them.
  const namesServiceType = matches.some((option) =>
    Object.values(SERVICE_TYPES).some((word) => word.test(compact(option))),
  );
  if (status === "military-status:served" && typeWord && namesServiceType)
    matches = matches.filter((option) => typeWord.test(compact(option)));
  const rankWord = rank && (ENLISTED_RANKS.has(rank) || /^(병장|상병|일병|이병)$/.test(rank))
    ? /현역.*\(병\)|현역병/
    : rank && /^(하사|중사|상사|원사|부사관)$/.test(rank)
      ? /현역.*\(부사관\)/
      : rank && /^(소위|중위|대위|소령|중령|대령|준장|소장|중장|대장|장교)$/.test(rank)
        ? /현역.*\(장교\)/ : undefined;
  if (status === "military-status:served" && rankWord && namesServiceType &&
      (!serviceType || serviceType === "현역" || serviceType === "현역병"))
    matches = matches.filter((option) => rankWord.test(compact(option)));
  if (matches.length === 1) return { status: "unique", option: matches[0] };
  if (matches.length === 0) return { status: "none" };
  return { status: "ambiguous", options: matches };
}
