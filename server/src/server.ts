import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "./config.js";
import { migrieren, sql } from "./db.js";
import { benutzerLaden } from "./sitzung.js";
import { anmeldungRouten } from "./routes/anmeldung.js";
import { systemRouten } from "./routes/system.js";
import { mitarbeiterRouten } from "./routes/mitarbeiter.js";

const app = Fastify({
  logger: { level: config.produktion ? "info" : "debug" },
  trustProxy: true, // hinter Traefik
  bodyLimit: 5 * 1024 * 1024,
});

await app.register(cookie, { secret: config.geheimnis });
app.addHook("onRequest", benutzerLaden);

// Grundlegende Sicherheits-Header
app.addHook("onSend", async (_a, antwort) => {
  antwort.header("X-Content-Type-Options", "nosniff");
  antwort.header("Referrer-Policy", "same-origin");
  antwort.header("X-Frame-Options", "DENY");
});

await app.register(anmeldungRouten);
await app.register(systemRouten);
await app.register(mitarbeiterRouten);

const webOrdner = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");
await app.register(fastifyStatic, { root: webOrdner, index: ["index.html"] });

// Unbekannte API-Pfade als JSON, alles andere zur Oberfläche
app.setNotFoundHandler((anfrage, antwort) => {
  if (anfrage.url.startsWith("/api/") || anfrage.url.startsWith("/auth/")) {
    return antwort.code(404).send({ fehler: "Nicht gefunden." });
  }
  return antwort.sendFile("index.html");
});

app.setErrorHandler((fehler, anfrage, antwort) => {
  anfrage.log.error(fehler);
  antwort.code(fehler.statusCode && fehler.statusCode < 500 ? fehler.statusCode : 500)
    .send({ fehler: fehler.statusCode && fehler.statusCode < 500 ? fehler.message : "Interner Fehler. Bitte später erneut versuchen." });
});

await migrieren((t) => app.log.info(t));
await app.listen({ host: "0.0.0.0", port: config.port });
app.log.info(`N-Flow ${config.version} (${config.instanz}) läuft auf ${config.baseUrl}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}
