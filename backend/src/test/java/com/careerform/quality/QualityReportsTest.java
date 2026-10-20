package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.util.Map;
import org.junit.jupiter.api.Test;

class QualityReportsTest {
    @Test
    void rejectsFieldProgressWithoutASnapshotBeforeAdmission() {
        var report = new QualityCollectionService.Report("event", null,
            Map.of("field", new QualityExecution.ClientState(true, true, true, true, null)), QualityExecution.Status.COMPLETED);
        assertThatThrownBy(() -> QualityReports.validate(report)).isInstanceOf(QualityAdmissionException.class);
    }
}
