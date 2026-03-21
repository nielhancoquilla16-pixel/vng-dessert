import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import aiRoute from "./routes/ai.js";
import inventoryRoute from "./routes/inventory.js";
import ordersRoute from "./routes/orders.js";

// Load .env from the server/ folder
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });
const clientDir = join(__dirname, "../client");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json());
app.use(express.static(clientDir));

app.use("/api/ai", aiRoute);
app.use("/api/inventory", inventoryRoute);
app.use("/api/orders", ordersRoute);

app.get("/", (req, res) => {
  res.sendFile(join(clientDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`V&G Dessert AI Server running on http://localhost:${PORT}`);
});
