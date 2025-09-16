import express from "express";
const router = express.Router();

// Temporary test route
router.get("/", (req, res) => {
  res.send("Admin route works 🛠️");
});

// ✅ default export required
export default router;
