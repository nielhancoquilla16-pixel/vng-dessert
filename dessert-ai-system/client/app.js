const API_BASE = "/api";

// Ask AI a question
async function askAI() {
  const question = document.getElementById("questionInput").value.trim();
  const responseDiv = document.getElementById("aiResponse");

  if (!question) {
    responseDiv.style.display = "block";
    responseDiv.textContent = "Please type a question first.";
    return;
  }

  responseDiv.style.display = "block";
  responseDiv.textContent = "Thinking...";

  try {
    const res = await fetch(`${API_BASE}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: question }),
    });

    const data = await res.json();
    responseDiv.textContent = data.reply || data.answer || data.error || "No response received.";
  } catch (err) {
    responseDiv.textContent = "Server is not running. Start it with: npm run dev";
  }
}

// Generate inventory report
async function getInventoryReport() {
  const responseDiv = document.getElementById("inventoryResponse");
  responseDiv.style.display = "block";
  responseDiv.textContent = "Generating report...";

  const sampleProducts = [
    { id: 1, name: "Leche Flan", stock: 2, category: "Puddings" },
    { id: 2, name: "Ube Cheesecake", stock: 15, category: "Cakes" },
    { id: 3, name: "Buko Pandan", stock: 0, category: "Desserts" },
  ];

  try {
    const res = await fetch(`${API_BASE}/inventory/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products: sampleProducts }),
    });

    const data = await res.json();

    responseDiv.textContent = [
      `Status: ${(data.status || "unknown").toUpperCase()}`,
      data.message || "No message received.",
      "",
      "Suggestions:",
      ...(data.suggestions || []).map((suggestion) => `  ${suggestion}`),
      "",
      `Total: ${data.summary?.total ?? 0} | Out: ${data.summary?.outOfStock ?? 0} | Low: ${data.summary?.lowStock ?? 0} | Good: ${data.summary?.wellStocked ?? 0}`,
    ].join("\n");
  } catch (err) {
    responseDiv.textContent = "Server is not running. Start it with: npm run dev";
  }
}

document.getElementById("questionInput")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    askAI();
  }
});
