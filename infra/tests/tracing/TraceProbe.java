import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

/** Synthetic local HTTP client/server only; no external API credentials. */
public class TraceProbe {
    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(18080), 0);
        server.createContext("/slow", exchange -> {
            try { Thread.sleep(150); } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        server.start();
        try {
            call();
            Thread.sleep(3000);
        } finally {
            server.stop(0);
        }
    }

    public static void call() throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            client.send(HttpRequest.newBuilder(URI.create(
                "http://127.0.0.1:18080/slow?synthetic=SYNTHETIC_PRIVATE_PROBE"))
                .header("Authorization", "Bearer SYNTHETIC_PRIVATE_PROBE")
                .GET().build(), HttpResponse.BodyHandlers.discarding());
        }
    }
}
