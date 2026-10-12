import base64
import http.client
import http.cookiejar
import json
import re
import urllib.error
import urllib.parse
import urllib.request


class MonitoringProxyChecks:
    def test_proxy_serves_login_assets_and_requires_grafana_authentication(self) -> None:
        ports = json.loads(self.configuration.read_text())["services"]["ingest"]["ports"]
        self.assertIn(80, [port["target"] for port in ports], "Nginx must publish the HTTP UI endpoint")
        checked = self._compose("exec", "-T", "ingest", "nginx", "-t")
        self.assertEqual(0, checked.returncode, checked.stderr)
        with urllib.request.urlopen(self.public_url + "login", timeout=5) as response:
            self.assertEqual(200, response.status)
            page = response.read().decode()
        asset = re.search(r'(?:src|href)="/?(public/build/[^"?]+\.js)', page)
        self.assertIsNotNone(asset, "Login page must reference a Grafana JavaScript asset")
        with urllib.request.urlopen(self.public_url + asset.group(1), timeout=5) as response:
            self.assertEqual(200, response.status)
            self.assertTrue(response.read(64))
        with self.assertRaises(urllib.error.HTTPError) as denied:
            urllib.request.urlopen(self.public_url + "api/user", timeout=5)
        self.assertEqual(401, denied.exception.code)
        denied.exception.close()

    def test_proxy_viewer_session_queries_dashboard_but_cannot_administer(self) -> None:
        browser, _ = self._viewer_session("synthetic-viewer-query")
        with browser.open(self.public_url + "api/user", timeout=5) as response:
            user = json.load(response)
        self.assertFalse(user["isGrafanaAdmin"])
        with browser.open(self.public_url + "api/dashboards/uid/career-form-monitoring", timeout=5) as response:
            self.assertEqual("career-form-monitoring", json.load(response)["dashboard"]["uid"])
        query = urllib.parse.urlencode({"query": "vector(1)"})
        with browser.open(self.public_url + "api/datasources/proxy/uid/prometheus/api/v1/query?" + query,
                          timeout=5) as response:
            self.assertEqual("1", json.load(response)["data"]["result"][0]["value"][1])
        with self.assertRaises(urllib.error.HTTPError) as denied:
            browser.open(self.public_url + "api/admin/settings", timeout=5)
        self.assertEqual(403, denied.exception.code)
        denied.exception.close()
        with browser.open(self.public_url + "api/frontend/settings", timeout=5) as response:
            self.assertEqual(self.public_url, json.load(response)["appUrl"])

    def test_proxy_upgrades_authenticated_live_websocket_with_public_origin(self) -> None:
        _, cookies = self._viewer_session("synthetic-viewer-live")
        request = urllib.request.Request(self.public_url + "api/live/ws")
        cookies.add_cookie_header(request)
        connection = http.client.HTTPConnection("127.0.0.1", self.ports["ui"], timeout=5)
        try:
            connection.request("GET", "/api/live/ws", headers={
                "Origin": self.public_url.rstrip("/"),
                "Cookie": request.get_header("Cookie"),
                "Upgrade": "websocket", "Connection": "Upgrade",
                "Sec-WebSocket-Version": "13",
                "Sec-WebSocket-Key": base64.b64encode(b"0123456789abcdef").decode(),
            })
            response = connection.getresponse()
            if response.status != 101:
                self.fail(f"Live handshake: {response.status} {response.read().decode()}; "
                          + self._compose("logs", "--tail", "20", "grafana").stdout)
            self.assertEqual("websocket", response.getheader("Upgrade").lower())
        finally:
            connection.close()

    def _viewer_session(self, login: str):
        created = self._request("/api/admin/users", "POST", {
            "name": login, "login": login, "email": f"{login}@example.test", "password": self.password,
        })
        self._request(f"/api/org/users/{created['id']}", "PATCH", {"role": "Viewer"})
        cookies = http.cookiejar.CookieJar()
        browser = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
        request = urllib.request.Request(self.public_url + "login",
            data=json.dumps({"user": login, "password": self.password}).encode(),
            headers={"Content-Type": "application/json", "Origin": self.public_url.rstrip("/")})
        with browser.open(request, timeout=5) as response:
            self.assertEqual(200, response.status)
        self.assertTrue(any(cookie.name == "grafana_session" for cookie in cookies))
        return browser, cookies
