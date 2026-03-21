import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import authRoute from "./routes/auth.js";
import aiRoute from "./routes/ai.js";
import cartsRoute from "./routes/carts.js";
import inventoryRoute from "./routes/inventory.js";
import ordersRoute from "./routes/orders.js";
import productsRoute from "./routes/products.js";
import profilesRoute from "./routes/profiles.js";

// Load .env from the server/ folder
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });
const clientDir = join(__dirname, "../client");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "*" })); // Allow all origins in development
app.use(express.json());
app.use(express.static(clientDir));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Server is running.",
  });
});

app.use("/api/auth", authRoute);
app.use("/api/ai", aiRoute);
app.use("/api/carts", cartsRoute);
app.use("/api/inventory", inventoryRoute);
app.use("/api/orders", ordersRoute);
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

  res.status(error.status || 500).json({
    error: error.message || "Internal server error.",
  });
});

app.listen(PORT, () => {
  console.log(`V&G Dessert AI Server running on http://localhost:${PORT}`);
});
