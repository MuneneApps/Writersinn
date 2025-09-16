import express from "express";
const router = express.Router();

// Temporary test route
router.get("/", (req, res) => {
  res.send("Tasks route works 📚");
});

export default router;
