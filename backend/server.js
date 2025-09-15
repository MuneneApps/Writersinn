// backend/server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Basic test route
app.get("/", (req, res) => {
  res.send("Backend running successfully 🚀");
});

// Import routes (each must export default)
import authRoutes from "./routes/auth.js";
import taskRoutes from "./routes/tasks.js";
import walletRoutes from "./routes/wallet.js";
import adminRoutes from "./routes/admin.js";

// Mount routes
app.use("/auth", authRoutes);
app.use("/tasks", taskRoutes);
app.use("/wallet", walletRoutes);
app.use("/admin", adminRoutes);

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
