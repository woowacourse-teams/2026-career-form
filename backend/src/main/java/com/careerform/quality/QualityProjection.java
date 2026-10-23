package com.careerform.quality;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;

public final class QualityProjection {

    private QualityProjection() {
    }

    public record Field(String key, String position, String control, boolean mapped, boolean eligible) {
    }

    public record Snapshot(String snapshotKey, String host, String structureKey, List<Field> fields, Baseline baseline) {
        public Snapshot(String snapshotKey, String host, String structureKey, List<Field> fields) {
            this(snapshotKey, host, structureKey, fields, null);
        }
        public Snapshot {
            fields = List.copyOf(fields);
        }

        public QualityMetrics.Counts counts() {
            return new QualityMetrics.Counts(fields.size(), fields.stream().filter(Field::mapped).count(),
                0, 0, 0, 0);
        }
    }

    public record Baseline(long fieldCount, boolean compatible) { }

    public static Snapshot fields(FieldsAnalysisRequest request, FieldsAnalysisResponse response) {
        return QualityCapturedSnapshot.from(request, response, new QualityCaptureBudget(Long.MAX_VALUE)).project();
    }

    public static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("품질 식별 해시를 생성할 수 없습니다", exception);
        }
    }
}
