package com.careerform.quality;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public final class QualityPublicLinks {
    private static final int MAXIMUM = 20;
    private static final java.util.regex.Pattern PUBLIC = java.util.regex.Pattern.compile(
        "https://([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.career\\.greetinghr\\.com)/(?:ko|en)/o/[1-9]\\d{0,11}/apply");
    private QualityPublicLinks() { }

    public record Link(String url, Instant firstSeen, Instant lastSeen) { }
    public record Observed(List<Link> links, boolean overflow) {
        public Observed { links = List.copyOf(links); }
    }

    public static String validate(String host, String url) {
        if (host == null || url == null || url.length() > 512) { return null; }
        var match = PUBLIC.matcher(url);
        return match.matches() && match.group(1).equals(host.toLowerCase(Locale.ROOT)) ? url : null;
    }

    public static Observed observe(List<Link> previous, boolean overflow, String host, String url, Instant at) {
        var safe = validate(host, url);
        return combine(safe == null ? previous : Stream.concat(previous.stream(), Stream.of(new Link(safe, at, at))).toList(), overflow);
    }

    public static Observed combine(List<Link> source, boolean overflow) {
        var unique = source.stream().collect(Collectors.toUnmodifiableMap(Link::url, link -> link,
            (first, next) -> new Link(first.url(), first.firstSeen().isBefore(next.firstSeen()) ? first.firstSeen() : next.firstSeen(),
                first.lastSeen().isAfter(next.lastSeen()) ? first.lastSeen() : next.lastSeen())));
        return new Observed(unique.values().stream().sorted(Comparator.comparing(Link::lastSeen).reversed().thenComparing(Link::url))
            .limit(MAXIMUM).toList(), overflow || unique.size() > MAXIMUM);
    }
}
