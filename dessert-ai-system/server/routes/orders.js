import express from "express";

const router = express.Router();

router.get("/summary", (req, res) => {
  res.json({
    message: "Order data is managed in the frontend via OrderContext. Connect a database to integrate here.",
    tip: "POST your orders from frontend to /api/orders/analyze for AI-powered insights.",
  });
});

router.post("/analyze", (req, res) => {
  const { orders } = req.body;

  if (!orders || orders.length === 0) {
    return res.json({
      totalRevenue: 0,
      orderCount: 0,
      analysis: "No orders to analyze yet.",
      aiTip: "Once you start receiving orders, the AI will provide detailed trend analysis here.",
    });
  }

  const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
  const avgOrder = totalRevenue / orders.length;

  res.json({
    totalRevenue,
    orderCount: orders.length,
    avgOrderValue: avgOrder.toFixed(2),
    analysis: `${orders.length} orders processed totaling PHP ${totalRevenue.toFixed(2)}.`,
    aiTip: "Consider running weekend promotions to boost mid-week orders.",
  });
});

export default router;
