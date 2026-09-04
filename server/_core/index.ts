import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";
import { createStripeWebhookHandler } from "../payment/stripeWebhook";
import { DrizzlePaymentRepository } from "../payment/drizzlePaymentRepository";
import { LocalPaymentRepository } from "../payment/localPaymentRepository";
import { createEmailOutboxWorkerHandler } from "../email/outboxWorkerEndpoint";
import { buildProductionMiraEmailOutboxWorker } from "../miraCore/emailOutboxWorker";
import { createResendWebhookHandler } from "../email/resendWebhook";
import { DrizzleEmailOutboxRepository } from "../email/outbox";
import { healthHandler, readinessHandler } from "./readiness";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Stripe requires the untouched JSON bytes for signature verification.
  app.post("/api/webhooks/stripe", express.raw({ type: "application/json", limit: "2mb" }), createStripeWebhookHandler({
    repository: ENV.paymentMode === "stripe" ? (ENV.miraLocalFileStore ? new LocalPaymentRepository() : new DrizzlePaymentRepository()) : undefined,
    webhookSecret: ENV.stripeWebhookSecret,
    paymentMode: ENV.paymentMode,
    currency: ENV.stripeCurrency,
    priceId: ENV.stripePriceId,
  }));
  app.post("/api/internal/mira/email-outbox/process", createEmailOutboxWorkerHandler(buildProductionMiraEmailOutboxWorker(), ENV.emailWorkerSecret));
  // Resend requires the untouched JSON bytes for svix-style signature verification.
  app.post("/api/webhooks/resend", express.raw({ type: "application/json", limit: "2mb" }), createResendWebhookHandler({
    secret: ENV.resendWebhookSecret,
    outboxRepository: ENV.paymentMode === "stripe" && !ENV.miraLocalFileStore ? new DrizzleEmailOutboxRepository() : undefined,
  }));
  app.get("/api/health", healthHandler);
  app.get("/api/internal/mira/readiness", readinessHandler);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use("/mira-v3", (_req, res, next) => {
    if (!ENV.miraV3Enabled) {
      return res.status(404).type("text/plain").send("Not found");
    }
    return next();
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
