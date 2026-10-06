package com.careerform.quality;

public final class QualityMetrics {

    private QualityMetrics() {
    }

    public record Counts(
        long discovered,
        long mapped,
        long bound,
        long attempted,
        long written,
        long retained
    ) {
        public Counts {
            if (retained < 0 || written < retained || attempted < written
                || bound < attempted || mapped < bound || discovered < mapped) {
                throw new IllegalArgumentException("품질 단계 수량을 확인할 수 없습니다");
            }
        }

        public Counts plus(Counts other) {
            return new Counts(
                Math.addExact(discovered, other.discovered),
                Math.addExact(mapped, other.mapped),
                Math.addExact(bound, other.bound),
                Math.addExact(attempted, other.attempted),
                Math.addExact(written, other.written),
                Math.addExact(retained, other.retained)
            );
        }

        public Ratios ratios() {
            return new Ratios(
                ratio(mapped, discovered),
                ratio(bound, mapped),
                ratio(written, attempted),
                ratio(retained, written),
                ratio(retained, discovered)
            );
        }

        public Coverage coverage(Long confirmedCount, boolean matchingScope) {
            if (confirmedCount == null) {
                return unavailableCoverage(CoverageStatus.UNREGISTERED);
            }
            if (confirmedCount < 0) {
                throw new IllegalArgumentException("확인한 필드 수는 음수일 수 없습니다");
            }
            if (!matchingScope || discovered > confirmedCount) {
                return unavailableCoverage(CoverageStatus.SCOPE_MISMATCH);
            }
            if (confirmedCount == 0) {
                return unavailableCoverage(CoverageStatus.NO_ELIGIBLE_FIELDS);
            }
            return new Coverage(
                CoverageStatus.REFERENCE,
                ratio(discovered, confirmedCount),
                ratio(mapped, confirmedCount),
                ratio(written, confirmedCount),
                ratio(retained, confirmedCount)
            );
        }
    }

    public record Ratios(
        Double mapping,
        Double binding,
        Double inputSuccess,
        Double retention,
        Double collectedRetention
    ) {
    }

    public enum CoverageStatus {
        UNREGISTERED,
        SCOPE_MISMATCH,
        NO_ELIGIBLE_FIELDS,
        REFERENCE
    }

    public record Coverage(
        CoverageStatus status,
        Double discovered,
        Double mapped,
        Double written,
        Double retained
    ) {
    }

    private static Coverage unavailableCoverage(CoverageStatus status) {
        return new Coverage(status, null, null, null, null);
    }

    private static Double ratio(long numerator, long denominator) {
        return denominator == 0 ? null : (double) numerator / denominator;
    }
}
