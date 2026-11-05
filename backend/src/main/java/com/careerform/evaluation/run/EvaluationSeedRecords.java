package com.careerform.evaluation.run;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.mongodb.ErrorCategory;
import com.mongodb.MongoWriteException;

/**
 * 저장소에 담아 둔 평가 기록을 서버가 뜰 때 없는 것만 넣는다. 평가를 켠 서버가 처음부터 기준 기록을 갖고 시작하게 하려는 것으로,
 * 모델을 호출하지 않으며 있는 기록은 건드리지 않는다. 파일 한 줄이 {@code {collection, document}} 하나이고(MongoDB Extended JSON),
 * 실행을 파일 끝에 두어 호출 결과보다 먼저 보이지 않게 한다.
 */
public final class EvaluationSeedRecords {

    private static final Logger log = LoggerFactory.getLogger(EvaluationSeedRecords.class);
    private static final String LOCATION = "classpath*:evaluation/seed-records/*.jsonl";
    private static final Set<String> COLLECTIONS = Set.of(MongoRunStore.RUNS, MongoRunStore.PROMPTS,
        MongoResultStore.RESULTS, MongoScoringStore.SCORINGS, MongoRecordNoteStore.NOTES);
    private static final Set<String> FINISHED = Set.of("COMPLETED", "PARTIAL");

    record Line(String collection, Document document) {
    }

    private final MongoTemplate mongo;
    private final List<Resource> files;

    public EvaluationSeedRecords(MongoTemplate mongo, List<Resource> files) {
        this.mongo = mongo;
        this.files = List.copyOf(files);
    }

    public static List<Resource> bundled() {
        try {
            return List.of(new PathMatchingResourcePatternResolver().getResources(LOCATION)).stream()
                .sorted(Comparator.comparing(Resource::getFilename)).toList();
        }
        catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    /** 기준 기록의 이름을 파일 순서대로. 파일 이름은 {@code 순번-이름.jsonl}이고, 화면이 이 순서로 기준 기록을 놓는다. */
    public static List<String> names() {
        return bundled().stream().map(Resource::getFilename)
            .map(name -> name.replaceFirst("^\\d+-", "").replaceFirst("\\.jsonl$", "")).toList();
    }

    /** 새로 넣은 문서 수. */
    public int insertMissing() {
        int inserted = 0;
        for (Resource file : files) {
            for (Line line : read(file)) {
                if (insert(line)) {
                    inserted++;
                }
            }
        }
        if (inserted > 0) {
            log.info("EVALUATION_SEED_RECORDS_INSERTED documents={}", inserted);
        }
        return inserted;
    }

    static List<Line> read(Resource file) {
        List<Line> lines = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            for (String text = reader.readLine(); text != null; text = reader.readLine()) {
                if (!text.isBlank()) {
                    lines.add(line(Document.parse(text)));
                }
            }
        }
        catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
        return lines;
    }

    private static Line line(Document parsed) {
        String collection = parsed.getString("collection");
        Document document = parsed.get("document", Document.class);
        if (!COLLECTIONS.contains(collection) || document == null || !document.containsKey("_id")) {
            throw new IllegalArgumentException("평가 기록이 아닙니다: " + collection);
        }
        if (MongoRunStore.RUNS.equals(collection) && !FINISHED.contains(document.getString("status"))) {
            throw new IllegalArgumentException("끝나지 않은 실행입니다: " + document.get("_id"));
        }
        return new Line(collection, document);
    }

    private boolean insert(Line line) {
        try {
            mongo.getCollection(line.collection()).insertOne(line.document());
            return true;
        }
        catch (MongoWriteException exception) {
            if (exception.getError().getCategory() == ErrorCategory.DUPLICATE_KEY) {
                return false;
            }
            throw exception;
        }
    }
}
