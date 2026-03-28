import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import authRoute from "./routes/auth.js";
import aiRoute, { getAiStatusPayload } from "./routes/ai.js";
import chatMessagesRoute from "./routes/chatMessages.js";
import cartsRoute from "./routes/carts.js";
import inventoryRoute from "./routes/inventory.js";
import ordersRoute from "./routes/orders.js";
import paymentsRoute from "./routes/payments.js";
import productsRoute from "./routes/products.js";
import profilesRoute from "./routes/profiles.js";
import { getProfileUploadsDirectory } from "./lib/profileImages.js";
import { getPayMongoStatusPayload } from "./lib/paymongo.js";
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
app.use(cors({ origin: "*" })); // Allow all origins in development
app.use(express.json({
  limit: "15mb",
  verify: (req, res, buffer) => {
    req.rawBody = buffer.toString("utf8");
  },
}));
app.use(express.static(clientDir));
app.use("/uploads", express.static(join(profileUploadsDir, "..")));

app.get("/api/health", (req, res) => {
  const aiStatus = getAiStatusPayload();
  const payMongoStatus = getPayMongoStatusPayload();

  res.json({
    status: "ok",
    message: "Server is running.",
    services: {
      ai: aiStatus,
      groq: aiStatus.groqConfigured ? "configured" : "local-fallback",
      paymongo: payMongoStatus,
    },
  });
});

const probeTable = async (client, table) => {
  const { error } = await client
    .from(table)
    .select("*")
    .limit(1);

  return {
    table,
    ok: !error,
    error: error?.message || null,
  };
};

app.get("/api/health/database", async (req, res, next) => {
  try {
    const publicConfigured = hasSupabasePublicConfig();
    const adminConfigured = hasSupabaseAdminConfig();

    if (!publicConfigured) {
      return res.status(503).json({
        status: "error",
        message: "Supabase public config is incomplete. Update SUPABASE_URL and SUPABASE_ANON_KEY in dessert-ai-system/server/.env.",
        config: {
          publicConfigured,
          adminConfigured,
        },
        checks: [],
      });
    }

    const checks = [];
    const publicClient = getSupabaseAnon();
    checks.push(await probeTable(publicClient, "products"));

    if (adminConfigured) {
      const adminClient = getSupabaseAdmin();
      for (const table of ["profiles", "inventory", "orders", "order_items", "order_issue_reports", "carts", "cart_items", "payment_checkouts"]) {
        checks.push(await probeTable(adminClient, table));
      }
    }

    const failingChecks = checks.filter((check) => !check.ok);
    const status = failingChecks.length > 0
      ? "error"
      : (adminConfigured ? "ready" : "degraded");
    const message = failingChecks.length > 0
      ? "Some required Supabase tables are not reachable. Apply supabase/schema.sql and verify table names."
      : (!adminConfigured
        ? "Public Supabase access is working, but admin-only features still need SUPABASE_SERVICE_ROLE_KEY."
        : "Supabase database is reachable and required tables responded.");

    res.status(failingChecks.length > 0 ? 503 : 200).json({
      status,
      message,
      config: {
        publicConfigured,
        adminConfigured,
      },
      checks,
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRoute);
app.use("/api/ai", aiRoute);
app.use("/api/chat-messages", chatMessagesRoute);
app.use("/api/carts", cartsRoute);
app.use("/api/inventory", inventoryRoute);
app.use("/api/orders", ordersRoute);
app.use("/api/payments", paymentsRoute);
app.use("/api/products", productsRoute);
app.use("/api/profiles", profilesRoute);

app.get("/", (req, res) => {
  res.sendFile(join(clientDir, "index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  const rawMessage = error?.message || 'Internal server error.';
  const normalizedMessage = (
    /TypeError: fetch failed|getaddrinfo ENOTFOUND/i.test(rawMessage)
      ? 'Backend could not reach Supabase. Check the values in dessert-ai-system/server/.env and restart the backend.'
      : rawMessage
  );
  const status = error.status || (/Supabase configuration is incomplete|could not reach Supabase/i.test(normalizedMessage) ? 503 : 500);

  res.status(status).json({
    error: normalizedMessage,
  });
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
