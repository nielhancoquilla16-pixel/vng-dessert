import express from "express";
import { publicErrorResponses } from "./middleware/publicErrorResponses.js";
import { httpErrorStatus } from "./lib/publicErrors.js";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { lookup } from "node:dns/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import authRoute from "./routes/auth.js";
import aiRoute from "./routes/ai.js";
import chatMessagesRoute from "./routes/chatMessages.js";
import cartsRoute from "./routes/carts.js";
import feedbackRoute from "./routes/feedback.js";
import inventoryRoute from "./routes/inventory.js";
import ordersRoute from "./routes/orders.js";
import paymentsRoute from "./routes/payments.js";
import preOrdersRoute from "./routes/preOrders.js";
import productsRoute from "./routes/products.js";
import profilesRoute from "./routes/profiles.js";
import salesReportsRoute from "./routes/salesReports.js";
import shopSettingsRoute from "./routes/shopSettings.js";
import { getProfileUploadsDirectory } from "./lib/profileImages.js";
import {
  getSupabaseAdmin,
  getSupabaseAnon,
  hasSupabaseAdminConfig,
  hasSupabasePublicConfig,
} from "./lib/supabaseAdmin.js";

// Load .env from the server/ folder
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });
const clientDir = join(__dirname, "../client");

const app = express();
const PORT = process.env.PORT || 3001;
const profileUploadsDir = getProfileUploadsDirectory();
const isProduction = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);
app.use((req, res, next) => {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const isSecureRequest = req.secure || forwardedProto === "https";
  const isHealthCheckRequest = req.path === "/api/health" || req.path === "/api/health/database";

  if (isProduction && !isHealthCheckRequest && forwardedProto === "http" && !isSecureRequest) {
    return res.redirect(301, `https://${req.get("host")}${req.originalUrl}`);
  }

  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  next();
});
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(publicErrorResponses);
app.use(express.json({
  limit: "15mb",
  verify: (req, res, buffer) => {
    req.rawBody = buffer.toString("utf8");
  },
}));
app.use(express.static(clientDir));
app.use("/uploads", express.static(join(profileUploadsDir, "..")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const probeTable = async (client, table) => {
  const { error } = await client
    .from(table)
    .select("*")
    .limit(1);

  return {
    table,
    ok: !error,
    error: error || null,
  };
};

const checkSupabaseHostname = async () => {
  const rawUrl = String(process.env.SUPABASE_URL || "").trim();

  try {
    const hostname = new URL(rawUrl).hostname;
    await lookup(hostname);
    return { ok: true, hostname, error: null };
  } catch (error) {
    return {
      ok: false,
      hostname: rawUrl,
      error: error?.code === "ENOTFOUND"
        ? "SUPABASE_URL host does not resolve. The Supabase project may be inactive/deleted, or the project ref may be wrong."
        : (error?.message || "SUPABASE_URL host could not be checked."),
    };
  }
};

app.get("/api/health/database", async (req, res, next) => {
  try {
    const publicConfigured = hasSupabasePublicConfig();
    const adminConfigured = hasSupabaseAdminConfig();
    if (!publicConfigured || !adminConfigured) {
      console.error("Database health configuration is incomplete.", { publicConfigured, adminConfigured });
      res.locals.errorLogged = true;
      return res.status(503).json({ error: "Service unavailable." });
    }

    const hostnameCheck = await checkSupabaseHostname();
    if (!hostnameCheck.ok) {
      console.error("Database health hostname check failed:", hostnameCheck);
      res.locals.errorLogged = true;
      return res.status(503).json({ error: "Service unavailable." });
    }

    const checks = [await probeTable(getSupabaseAnon(), "products")];
    const adminClient = getSupabaseAdmin();
    for (const table of ["profiles", "inventory", "orders", "pre_orders", "order_items", "order_issue_reports", "return_refund_requests", "shop_settings", "order_feedback", "sales_reports", "sales_report_items", "product_recipes", "product_recipe_items", "carts", "cart_items", "payment_checkouts", "customer_addresses"]) {
      checks.push(await probeTable(adminClient, table));
    }

    const failingChecks = checks.filter((check) => !check.ok);
    if (failingChecks.length) {
      console.error("Database health checks failed:", failingChecks);
      res.locals.errorLogged = true;
      return res.status(503).json({ error: "Service unavailable." });
    }
    res.json({ status: "ready" });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRoute);
app.use("/api/ai", aiRoute);
app.use("/api/chat-messages", chatMessagesRoute);
app.use("/api/carts", cartsRoute);
app.use("/api/feedback", feedbackRoute);
app.use("/api/inventory", inventoryRoute);
app.use("/api/orders", ordersRoute);
app.use("/api/payments", paymentsRoute);
app.use("/api/pre-orders", preOrdersRoute);
app.use("/api/products", productsRoute);
app.use("/api/profiles", profilesRoute);
app.use("/api/sales-reports", salesReportsRoute);
app.use("/api/shop-settings", shopSettingsRoute);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "We could not find what you requested." });
});

app.get("/", (req, res) => {
  res.sendFile(join(clientDir, "index.html"));
});

const isMalformedJsonError = (error) => (
  error?.type === "entity.parse.failed"
  || (
    error instanceof SyntaxError
    && error?.status === 400
    && Object.prototype.hasOwnProperty.call(error, "body")
  )
);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (isMalformedJsonError(error)) {
    // Do not log the submitted body: it may contain passwords or other private input.
    console.warn("Rejected malformed JSON request:", { method: req.method, path: req.path });
    res.locals.errorLogged = true;
    return res.status(400).json({ error: "Please check your information and try again." });
  }

  console.error("Request exception:", { method: req.method, path: req.path, error });
  res.locals.errorLogged = true;
  const diagnostic = [error?.message, error?.details, error?.cause?.code].filter(Boolean).join(" ");
  const unavailable = /fetch failed|ENOTFOUND|ECONN\w*|ETIMEDOUT|EACCES|configuration is incomplete/i.test(diagnostic);
  const status = httpErrorStatus(error?.status || error?.statusCode, unavailable ? 503 : 500);
  res.status(status).json({ error: error?.message, errorCode: error?.errorCode });
});

const startServer = async () => {
  const healthUrl = `http://127.0.0.1:${PORT}/api/health`;

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (response.ok) {
      console.log(`V&G Dessert AI Server is already running on http://localhost:${PORT}.`);
      return;
    }
  } catch {
    // No healthy backend is responding on this port, so we can try to bind it.
  }

  const server = app.listen(PORT, () => {
    console.log(`V&G Dessert AI Server running on http://localhost:${PORT}`);
  });

  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. If another V&G backend is already running, keep that instance and do not start a duplicate.`);
      process.exit(0);
      return;
    }

    throw error;
  });
};

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
