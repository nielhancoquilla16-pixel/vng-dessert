import express from "express";

const router = express.Router();

router.post("/report", (req, res) => {
  const { products } = req.body;

  if (!products || products.length === 0) {
    return res.json({
      status: "no_data",
      message: "No products found. Add products through the Admin panel.",
      suggestions: [],
    });
  }

  const lowStock = products.filter((product) => product.stock < 10 && product.stock > 0);
  const outOfStock = products.filter((product) => product.stock === 0);
  const wellStocked = products.filter((product) => product.stock >= 10);

  const status = outOfStock.length > 0 ? "warning" : lowStock.length > 0 ? "caution" : "good";

  const message =
    outOfStock.length > 0
      ? `${outOfStock.length} item(s) are sold out and losing potential revenue.`
      : lowStock.length > 0
        ? `${lowStock.length} item(s) are running low. Consider restocking soon.`
        : "All stock levels are healthy and optimized for current demand.";

  const suggestions = [
    ...outOfStock.map((product) => `Restock "${product.name}" immediately because it is sold out.`),
    ...lowStock.map((product) => `Top up "${product.name}" soon because only ${product.stock} item(s) remain.`),
    ...wellStocked.slice(0, 1).map((product) => `"${product.name}" is well-stocked and could be featured in promotions.`),
  ];

  res.json({
    status,
    message,
    summary: {
      total: products.length,
      outOfStock: outOfStock.length,
      lowStock: lowStock.length,
      wellStocked: wellStocked.length,
    },
    suggestions,
  });
});

router.get("/health", (req, res) => {
  res.json({
    status: "ready",
    message: "Inventory AI route is active. POST products to /api/inventory/report for analysis.",
  });
});

export default router;
