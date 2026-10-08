package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

class QualityDiscordTest {
    @Test
    void malformedConfigurationNeverDisclosesWebhook() {
        var secret = "https://discord.com/api/webhooks/123/synthetic secret";
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> new QualityDiscord(secret))
            .isInstanceOf(IllegalArgumentException.class).hasMessage("Invalid dedicated Discord configuration").hasNoCause();
    }

    @Test
    void preservesLongDailyRequestsInOneEmbedWithoutMentions() {
        var message = "확인 대상 ".repeat(400);
        var discord = new QualityDiscord(body -> {
            var json = tools.jackson.databind.json.JsonMapper.builder().build().readTree(body);
            assertThat(json.path("embeds").get(0).path("description").asString()).isEqualTo(message);
            assertThat(json.path("allowed_mentions").path("parse").size()).isZero();
            return new QualityDiscord.Response(200, "{\"id\":\"123\"}");
        }, milliseconds -> { });
        assertThat(discord.send(message).status()).isEqualTo(QualityDiscord.Status.SENT);
    }
    @Test
    void retriesOnlyDefiniteRateLimitAndRequiresReturnedMessageId() {
        var calls = new AtomicInteger();
        var pauses = new java.util.ArrayList<Long>();
        var discord = new QualityDiscord(body -> {
            assertThat(body).contains("allowed_mentions", "parse");
            return calls.incrementAndGet() == 1 ? new QualityDiscord.Response(429, "{\"retry_after\":0.1}")
                : new QualityDiscord.Response(200, "{\"id\":\"123456\"}");
        }, pauses::add);
        assertThat(discord.send("합성 확인 요청")).isEqualTo(new QualityDiscord.Result(QualityDiscord.Status.SENT, "123456"));
        assertThat(calls.get()).isEqualTo(2);
        assertThat(pauses).containsExactly(100L);
        assertThat(new QualityDiscord(body -> new QualityDiscord.Response(204, "{}"), pauses::add).send("test").status()).isEqualTo(QualityDiscord.Status.UNKNOWN);
    }

    @Test
    void neverRetriesAmbiguousDeliveryOrExcessiveRateLimit() {
        var calls = new AtomicInteger();
        var discord = new QualityDiscord(body -> { calls.incrementAndGet(); throw new java.net.http.HttpTimeoutException("synthetic"); }, milliseconds -> { });
        assertThat(discord.send("test").status()).isEqualTo(QualityDiscord.Status.UNKNOWN);
        assertThat(calls.get()).isEqualTo(1);
        calls.set(0);
        var limited = new QualityDiscord(body -> { calls.incrementAndGet(); return new QualityDiscord.Response(429, "{\"retry_after\":0}"); }, milliseconds -> { });
        assertThat(limited.send("test").status()).isEqualTo(QualityDiscord.Status.REJECTED);
        assertThat(calls.get()).isEqualTo(4);
    }
}
