package com.careerform.evaluation.api;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** AI 평가 화면. 품질 확인 로그인 틀을 쓰며 평가 기능이 켜졌을 때만 연다. */
@Controller
@ConditionalOnProperty(prefix = "career-form.evaluation", name = "enabled", havingValue = "true")
public final class EvaluationPageController {

    @GetMapping({"/evaluations", "/evaluations/"})
    public String index() {
        return "forward:/evaluations/index.html";
    }
}
