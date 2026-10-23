package com.careerform.formanalysis.exception;

public final class TokenLimitExceeded extends RuntimeException {

    public TokenLimitExceeded() {
        super("Jev 분석 요청이 공급자 토큰 한도를 넘었습니다");
    }
}
