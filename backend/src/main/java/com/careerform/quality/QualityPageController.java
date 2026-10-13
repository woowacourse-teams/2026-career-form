package com.careerform.quality;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public final class QualityPageController {
    @GetMapping({"/quality", "/quality/"})
    public String index() { return "forward:/quality/index.html"; }
}
