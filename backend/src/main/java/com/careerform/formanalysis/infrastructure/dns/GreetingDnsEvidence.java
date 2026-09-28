package com.careerform.formanalysis.infrastructure.dns;

import java.util.Hashtable;
import java.util.Locale;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.regex.Pattern;

import javax.naming.NamingException;
import javax.naming.Context;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.DirContext;
import javax.naming.directory.InitialDirContext;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.GreetingDomainEvidence;

@Component
public final class GreetingDnsEvidence implements GreetingDomainEvidence {

    private static final Pattern GREETING_HOST = Pattern.compile(
        "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.career\\.greetinghr\\.com$");
    private static final Pattern APPLICATION_PATH = Pattern.compile(
        "^/[a-z]{2}/o/(?:\\*|[0-9]+)(?:/apply)?$"
    );
    private static final Pattern PUBLIC_HOST = Pattern.compile(
        "^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+"
            + "[a-z](?:[a-z0-9-]*[a-z0-9])?$"
    );
    private static final long POSITIVE_TTL_NANOS = 300_000_000_000L;
    private static final long NEGATIVE_TTL_NANOS = 60_000_000_000L;
    private static final long FAILURE_TTL_NANOS = 10_000_000_000L;
    private static final int MAX_CACHED_HOSTS = 4096;

    private final CnameLookup lookup;
    private final ConcurrentHashMap<String, CacheEntry> cache = new ConcurrentHashMap<>();
    private final Semaphore queries = new Semaphore(16);

    int cachedHostCount() {
        return cache.size();
    }

    @Autowired
    public GreetingDnsEvidence(
        @Value("${careerform.greeting.dns-provider-url:dns://1.1.1.1 dns://8.8.8.8}")
        String dnsProviderUrl
    ) {
        this(host -> queryCname(host, dnsProviderUrl));
    }

    GreetingDnsEvidence(CnameLookup lookup) {
        this.lookup = lookup;
    }

    @Override
    public Decision classify(String host, String pathPattern) {
        if (host == null || pathPattern == null
            || !APPLICATION_PATH.matcher(pathPattern).matches()) {
            return Decision.NO_POSITIVE_EVIDENCE;
        }
        String normalized = normalize(host);
        if (!isPublicHost(normalized)) {
            return Decision.NO_POSITIVE_EVIDENCE;
        }
        if (GREETING_HOST.matcher(normalized).matches()) {
            return Decision.POSITIVE;
        }
        CacheEntry cached = cache.get(normalized);
        long now = System.nanoTime();
        if (cached != null && now - cached.createdAtNanos() < cached.ttlNanos()) {
            return cached.decision();
        }
        Decision decision = queryAliasChain(normalized);
        long ttl = switch (decision) {
            case POSITIVE -> POSITIVE_TTL_NANOS;
            case NO_POSITIVE_EVIDENCE -> NEGATIVE_TTL_NANOS;
            case RETRYABLE_FAILURE -> FAILURE_TTL_NANOS;
        };
        cacheDecision(normalized, decision, ttl, System.nanoTime());
        return decision;
    }

    private void cacheDecision(String host, Decision decision, long ttl, long now) {
        synchronized (cache) {
            cache.entrySet().removeIf(entry ->
                now - entry.getValue().createdAtNanos() >= entry.getValue().ttlNanos());
            if (cache.size() < MAX_CACHED_HOSTS) {
                cache.put(host, new CacheEntry(decision, now, ttl));
            }
        }
    }

    private Decision queryAliasChain(String host) {
        if (!queries.tryAcquire()) {
            return Decision.RETRYABLE_FAILURE;
        }
        try {
            String current = host;
            Set<String> visited = new HashSet<>();
            for (int hop = 0; hop < 3; hop++) {
                if (!visited.add(current)) {
                    return Decision.RETRYABLE_FAILURE;
                }
                LookupResult result;
                try {
                    result = lookup.find(current);
                }
                catch (RuntimeException exception) {
                    return Decision.RETRYABLE_FAILURE;
                }
                if (result instanceof LookupFailure) {
                    return Decision.RETRYABLE_FAILURE;
                }
                if (result instanceof NoAlias) {
                    return Decision.NO_POSITIVE_EVIDENCE;
                }
                current = normalize(((Alias) result).target());
                if (!isPublicHost(current)) {
                    return Decision.NO_POSITIVE_EVIDENCE;
                }
                if (GREETING_HOST.matcher(current).matches()) {
                    return Decision.POSITIVE;
                }
            }
            return Decision.RETRYABLE_FAILURE;
        }
        finally {
            queries.release();
        }
    }

    private static LookupResult queryCname(String host, String dnsProviderUrl) {
        Hashtable<String, String> environment = new Hashtable<>();
        environment.put("java.naming.factory.initial", "com.sun.jndi.dns.DnsContextFactory");
        environment.put("com.sun.jndi.dns.timeout.initial", "1000");
        environment.put("com.sun.jndi.dns.timeout.retries", "1");
        environment.put(Context.PROVIDER_URL, dnsProviderUrl);
        DirContext context = null;
        try {
            context = new InitialDirContext(environment);
            Attributes attributes = context.getAttributes(host, new String[] {"CNAME"});
            Attribute cname = attributes.get("CNAME");
            return cname == null || cname.size() == 0
                ? new NoAlias()
                : new Alias(String.valueOf(cname.get(0)));
        }
        catch (NamingException exception) {
            return new LookupFailure();
        }
        finally {
            if (context != null) {
                try {
                    context.close();
                }
                catch (NamingException ignored) {
                    // The lookup result remains authoritative; closing is best effort.
                }
            }
        }
    }

    private static boolean isPublicHost(String host) {
        return PUBLIC_HOST.matcher(host).matches()
            && !host.endsWith(".local")
            && !host.endsWith(".internal")
            && !host.endsWith(".localhost")
            && !host.endsWith(".test")
            && !host.endsWith(".invalid")
            && !host.endsWith(".example");
    }

    private static String normalize(String host) {
        if (host == null) {
            return "";
        }
        String lower = host.toLowerCase(Locale.ROOT).trim();
        return lower.endsWith(".") ? lower.substring(0, lower.length() - 1) : lower;
    }

    @FunctionalInterface
    interface CnameLookup {
        LookupResult find(String host);
    }

    sealed interface LookupResult permits Alias, NoAlias, LookupFailure {
    }

    record Alias(String target) implements LookupResult {
    }

    record NoAlias() implements LookupResult {
    }

    record LookupFailure() implements LookupResult {
    }

    private record CacheEntry(Decision decision, long createdAtNanos, long ttlNanos) {
    }
}
