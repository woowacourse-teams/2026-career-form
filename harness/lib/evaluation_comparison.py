from collections.abc import Mapping

from harness.lib.evaluation_revision import RevisionEvidence


def revision_comparison(
    current: Mapping[str, object], previous: Mapping[str, object], source: str
) -> dict[str, object]:
    current_sites, previous_sites = current.get("sites"), previous.get("sites")
    if not isinstance(current_sites, Mapping) or not isinstance(previous_sites, Mapping):
        raise ValueError("비교 artifact에 sites가 필요합니다")
    reasons: set[str] = set()
    pairs: list[dict[str, object]] = []
    for site_id in sorted(current_sites):
        now, before = current_sites[site_id], previous_sites[site_id]
        if not isinstance(now, Mapping) or not isinstance(before, Mapping):
            raise ValueError("비교 site는 객체여야 합니다")
        for site in (now, before):
            evidence = RevisionEvidence.parse(site.get("revision_evidence"), source)
            evidence.validate_claim(site.get("revision"), site.get("revision_status"))
            if site.get("status") not in ("MEASURED", "INCONCLUSIVE"):
                raise ValueError("비교 site status가 올바르지 않습니다")
        if now["status"] != "MEASURED" or before["status"] != "MEASURED":
            reasons.add("INCONCLUSIVE_SITE")
        if now["revision_status"] != "VERIFIED" or before["revision_status"] != "VERIFIED":
            reasons.add("UNVERIFIED_REVISION")
        elif now["revision"] == before["revision"]:
            reasons.add("SAME_REVISION")
        pairs.append({
            "site_id": site_id,
            "previous_revision": before["revision"],
            "current_revision": now["revision"],
        })
    if not pairs:
        reasons.add("NO_MEASURED_SITES")
    return {
        "status": "HELD" if reasons else "COMPARABLE",
        "reasons": sorted(reasons),
        "sites": pairs,
    }
