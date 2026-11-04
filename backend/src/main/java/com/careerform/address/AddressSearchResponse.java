package com.careerform.address;

import java.util.List;

public record AddressSearchResponse(List<Address> addresses, int page, int pageSize, long totalCount) {
    public AddressSearchResponse { addresses = List.copyOf(addresses); }

    public record Address(String postalCode, String roadAddress, String jibunAddress, String buildingManagementNumber) {
        @Override public String toString() { return "Address[redacted]"; }
    }

    @Override public String toString() { return "AddressSearchResponse[redacted]"; }
}
