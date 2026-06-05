# Server-Level Proxy Examples

These examples are intentionally outside `docker-compose.yml`.

The architecture assigns public ingress, TLS, compression, and domain routing to a server-level Caddy or Nginx process. The app compose stack starts only harness application containers and data services.

Example upstreams for local/server installation:

- Frontend: `127.0.0.1:3000`
- Go API: `127.0.0.1:8080`

Use either `caddy/Caddyfile.example` or `nginx/harness.conf.example` as a starting point for the VM-level proxy configuration.
