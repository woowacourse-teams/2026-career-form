package com.careerform.notification;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
@ConditionalOnProperty(prefix = "career-form.notification", name = "enabled", havingValue = "true")
public final class NotificationPageController {
    @GetMapping({"/notifications", "/notifications/"})
    public String index() { return "forward:/notifications/index.html"; }
}
