package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import com.careerform.evaluation.api.RecordNoteController;

@DisplayName("평가 기록 메모 API")
class RecordNoteApiTest {

    private static final Instant AT = Instant.parse("2026-11-05T00:00:00Z");
    private final InMemoryRunStore runs = new InMemoryRunStore();
    private final InMemoryRecordNoteStore notes = new InMemoryRecordNoteStore();
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new RecordNoteController(runs, notes)).build();

    private void comparison() {
        runs.registerComparison(List.of(RunStoreContract.run("a", "fp", "cmp"), RunStoreContract.run("b", "fp", "cmp")));
        runs.transition("a", RunStatus.QUEUED, RunStatus.CANCELLED, AT);
        runs.transition("b", RunStatus.WAITING, RunStatus.CANCELLED, AT);
    }

    private org.springframework.test.web.servlet.ResultActions save(String key, String note) throws Exception {
        return mvc.perform(put("/api/v1/evaluations/records/" + key + "/note").contentType(MediaType.APPLICATION_JSON)
            .content(tools.jackson.databind.json.JsonMapper.builder().build()
                .writeValueAsString(java.util.Collections.singletonMap("note", note))));
    }

    @Test
    @DisplayName("기록(비교 묶음 또는 단독 실행)에 이전과 달라진 점을 적고, 다시 적으면 바뀌고, 비우면 지워진다")
    void savesReplacesAndClears() throws Exception {
        comparison();
        runs.register(RunStoreContract.run("solo", "fp"));

        save("cmp", "  화면 전체를 한 번에 묻던 초기 구조  ").andExpect(status().isOk())
            .andExpect(jsonPath("$.note").value("화면 전체를 한 번에 묻던 초기 구조"));
        save("solo", "프롬프트 수정").andExpect(status().isOk());
        mvc.perform(get("/api/v1/evaluations/notes")).andExpect(jsonPath("$.cmp").value("화면 전체를 한 번에 묻던 초기 구조"))
            .andExpect(jsonPath("$.solo").value("프롬프트 수정"));

        save("cmp", "5칸씩 나눠 묻는 구조").andExpect(status().isOk());
        assertThat(notes.all()).containsEntry("cmp", "5칸씩 나눠 묻는 구조");

        save("cmp", "   ").andExpect(status().isOk()).andExpect(jsonPath("$.note").doesNotExist());
        assertThat(notes.all()).doesNotContainKey("cmp");
    }

    @Test
    @DisplayName("없는 기록, 비교에 속한 실행 하나, 300자를 넘는 메모는 받지 않는다")
    void rejectsUnknownRecordsAndLongNotes() throws Exception {
        comparison();

        save("missing", "메모").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("UNKNOWN_RUN"));
        // 화면이 묶음 단위로 보이므로 묶음 안의 실행 하나에는 적지 않는다.
        save("a", "메모").andExpect(status().isNotFound());
        save("cmp", "가".repeat(301)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("NOTE_TOO_LONG"));
        assertThat(notes.all()).isEmpty();
    }

    @Test
    @DisplayName("기록을 지우면 그 기록의 메모도 지운다")
    void deletingARecordDeletesItsNote() throws Exception {
        comparison();
        save("cmp", "메모").andExpect(status().isOk());

        new RunDeletionService(runs, new InMemoryResultStore(), new InMemoryScoringStore(), notes).delete("cmp", "tester");

        assertThat(notes.all()).isEmpty();
    }
}
