package com.careerform.evaluation.api;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.careerform.evaluation.run.RecordNoteStore;
import com.careerform.evaluation.run.RunStore;

/**
 * 평가 기록 메모 API. 품질 확인 비밀번호로 보호한다(QualityApiFilter). 기록마다 이전과 무엇이 달라졌는지 사람이 적어 두는
 * 글이며, 측정 결과는 바꾸지 않는다. 기록 삭제와 달리 비밀번호를 다시 묻지 않는다.
 */
@RestController
@ConditionalOnProtectedEvaluation
@RequestMapping("/api/v1/evaluations")
public final class RecordNoteController {

    static final int MAX_LENGTH = 300;
    private static final Pattern REQUESTER = Pattern.compile("[0-9A-Za-z가-힣._-]{1,32}");
    private static final String DEFAULT_REQUESTER = "quality-admin";

    private final RunStore runs;
    private final RecordNoteStore notes;

    public RecordNoteController(RunStore runs, RecordNoteStore notes) {
        this.runs = runs;
        this.notes = notes;
    }

    public record NoteInput(String note) {
    }

    @GetMapping("/notes")
    public Map<String, String> notes() {
        return notes.all();
    }

    /** 메모를 적는다. 비우면 지운다. 화면이 기록을 묶음 단위로 보이므로 키는 비교 ID, 단독 실행이면 실행 ID다. */
    @PutMapping("/records/{recordKey}/note")
    public ResponseEntity<Map<String, String>> save(@PathVariable String recordKey, @RequestBody NoteInput input,
        @RequestHeader(value = "X-Evaluation-Requester", required = false) String requester) {
        boolean known = !runs.comparison(recordKey).isEmpty()
            || runs.find(recordKey).filter(run -> run.comparisonId() == null).isPresent();
        if (!known) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("code", "UNKNOWN_RUN"));
        }
        String note = input == null || input.note() == null ? "" : input.note().strip();
        if (note.length() > MAX_LENGTH) {
            return ResponseEntity.badRequest().body(Map.of("code", "NOTE_TOO_LONG"));
        }
        if (note.isEmpty()) {
            notes.delete(List.of(recordKey));
            return ResponseEntity.ok(Collections.singletonMap("note", null));
        }
        notes.save(recordKey, note, requester != null && REQUESTER.matcher(requester).matches() ? requester : DEFAULT_REQUESTER);
        return ResponseEntity.ok(Map.of("note", note));
    }
}
