package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("직무 필터 전환 설정")
class RoleFilterPolicyTest {
    @Test
    @DisplayName("기본값은 꺼짐이라 받을 직무를 고르지 않은 구독도 발송 대상이고, 켜면 선택 구독만 대상이다")
    void defaultsToRelaxed() {
        assertThat(RoleFilterPolicy.defaults().enforced()).isFalse();
        assertThat(RoleFilterPolicy.defaults()).isEqualTo(new RoleFilterPolicy(false));
        assertThat(new RoleFilterPolicy(true).enforced()).isTrue();
    }
}
