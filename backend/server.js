
import axios from "axios";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Parser } from "json2csv";
import crypto from "crypto";
import nodemailer from "nodemailer";
import multer from "multer";
import path from "path";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ✅ Serve static files (verify.html, dashboard.html, etc.)
app.use(express.static(path.join(__dirname)));

// Multer setup (for both adding tasks and submitting tasks)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// Test route
app.get("/", (req, res) => res.json({ message: "WritersInn backend connected to Supabase" }));

// Add user
app.post("/add-user", async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email || !phone) return res.status(400).json({ error: "Name, email, and phone are required" });

    const { data: existingUser } = await supabase.from("users").select("*").eq("email", email).single();
    if (existingUser) return res.status(400).json({ error: "Email already registered" });

    const { data, error } = await supabase.from("users")
      .insert([{ name, email, phone, subscribed: false, balance: 0 }])
      .select()
      .single();
    if (error) throw error;

    res.json({ message: "✅ User added successfully", user: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add task (admin)
app.post("/admin/add-task", upload.single("file"), async (req, res) => {
  try {
    const secret = req.headers["x-admin-secret"];
    if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: "Unauthorized" });

    const { title, description, price } = req.body;
    const file = req.file;
    if (!title || !description || !price || !file) return res.status(400).json({ error: "All fields including file are required" });

    const { data, error } = await supabase.from("tasks")
      .insert([{ title, description, price: Number(price), file_path: file.filename }])
      .select()
      .single();
    if (error) throw error;

    res.json({ success: true, message: "✅ Task added successfully", task: data });
  } catch (err) {
    console.error("Add task error:", err);
    res.status(400).json({ error: err.message });
  }
});

// Get all tasks
app.get("/tasks", async (req, res) => {
  const { data, error } = await supabase.from("tasks").select("*");
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Get user by email
app.get("/user/:email", async (req, res) => {
  const { email } = req.params;
  const { data, error } = await supabase.from("users").select("*").eq("email", email).single();
  if (error) return res.status(404).json({ error: "User not found" });
  res.json(data);
});
app.post("/take-task", async (req, res) => {
    try {
      const { email, task_id } = req.body;
      if (!email || !task_id) return res.status(400).json({ error: "Email and task ID are required" });
  
      // Lookup user
      const { data: user } = await supabase.from("users").select("*").eq("email", email).single();
      if (!user) return res.status(404).json({ error: "User not found" });
  
      // Check pending/completed tasks
      const { data: assignments } = await supabase
        .from("assignments")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["pending", "completed"]);
  
      if (assignments.length > 0) {
        return res.status(403).json({ error: "⚠ Wait 3 days before taking a new task." });
      }
  
      // Lookup task
      const { data: task } = await supabase.from("tasks").select("*").eq("id", task_id).single();
      if (!task) return res.status(404).json({ error: "Task not found" });
  
      // Assign task as pending
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + 6);
      const { data: assignment, error: assignError } = await supabase
        .from("assignments")
        .insert([{
          user_id: user.id,
          task_id: task.id,
          status: "pending",
          deadline: deadline.toISOString(),
        }])
        .select()
        .single();
      if (assignError) throw assignError;
  
      // Send email with instructions only
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: `New Task Assigned: ${task.title}`,
        html: `
          <p>Hello ${user.name},</p>
          <p>Your task has been assigned successfully.</p>
          <strong>${task.title}</strong><br/>
          ${task.description}<br/>
          <p><strong>Instructions:</strong></p>
          <ul>
            <li>No use of AI</li>
            <li>300 words strictly</li>
            <li>APA7 format</li>
          </ul>
        `
      });
  
      res.json({ message: "✅ Task assigned and instructions sent to your email", assignment });
  
    } catch (err) {
      console.error("Take task error:", err);
      res.status(500).json({ error: err.message });
    }
  });
  
  
  

// Get assignments for user
app.get("/assignments/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { data: user } = await supabase.from("users").select("id").eq("email", email).single();
    if (!user) return res.status(404).json({ error: "User not found" });

    const { data: assignments } = await supabase.from("assignments").select("*").eq("user_id", user.id);
    const detailed = await Promise.all(assignments.map(async a => {
      const { data: task } = await supabase.from("tasks").select("*").eq("id", a.task_id).single();
      return { ...a, task };
    }));

    res.json(detailed);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Submit task
app.post("/submit-task", upload.single("file"), async (req, res) => {
  try {
    const { email, assignment_id } = req.body;
    const file = req.file;
    if (!email || !assignment_id || !file) return res.status(400).json({ error: "Missing data or file" });

    const { data: user } = await supabase.from("users").select("*").eq("email", email).single();
    if (!user) return res.status(404).json({ error: "User not found" });

    const { data: assignment } = await supabase.from("assignments").select("*").eq("id", assignment_id).single();
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const { data: task } = await supabase.from("tasks").select("*").eq("id", assignment.task_id).single();
    if (!task) return res.status(404).json({ error: "Task not found" });

    const { data: updatedAssignment, error } = await supabase.from("assignments")
      .update({ status: "completed", file_path: file.filename })
      .eq("id", assignment_id)
      .select()
      .single();
    if (error) throw error;

    await supabase.from("users").update({ balance: user.balance + task.price }).eq("id", user.id);

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Task Submission Received",
      html: `<p>Hello ${user.name},</p><p>Your submission for <strong>${task.title}</strong> has been received.</p><p>Amount $${task.price} added to balance.</p>`
    });

    res.json({ message: "✅ Task submitted successfully", assignment: { ...updatedAssignment, task_price: task.price } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Available tasks
app.get("/available-tasks/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { data: user } = await supabase.from("users").select("id").eq("email", email).single();
    if (!user) return res.status(404).json([]);

    const { data: assignments } = await supabase.from("assignments").select("task_id").eq("user_id", user.id);
    const assignedIds = assignments?.map(a => a.task_id) || [];

    const { data: tasks } = await supabase.from("tasks").select("*").not("id", "in", `(${assignedIds.join(",")})`);
    res.json(tasks || []);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Admin: mark subscribed
app.post("/admin/mark-subscribed", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: "Unauthorized" });

  const { email, subscribed } = req.body;
  const { data, error } = await supabase.from("users").update({ subscribed }).eq("email", email).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: "✅ Subscription updated", user: data });
});

// Admin: export subscribed
app.get("/admin/export-subscribed", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: "Unauthorized" });

  const { data: users, error } = await supabase.from("users").select("id,name,email,phone").eq("subscribed", true);
  if (error) return res.status(400).json({ error: error.message });
  if (!users.length) return res.json({ message: "No subscribed users found" });

  const parser = new Parser({ fields: ["id", "name", "email", "phone"] });
  const csv = parser.parse(users);
  await supabase.from("users").delete().eq("subscribed", true);

  res.header("Content-Type", "text/csv");
  res.attachment("subscribed_users.csv");
  res.send(csv);
});

// Admin: get users
app.get("/users", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: "Unauthorized" });

  const { data, error } = await supabase.from("users").select("id,name,email,phone,subscribed,balance");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on https://writersinn-1.onrender.com`);
});

// ✅ Login (magic link)
app.post("/login", async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email || !phone) return res.status(400).json({ error: "Name, email, and phone are required" });

    // Check if user exists
    let { data: user } = await supabase.from("users").select("*").eq("email", email).single();

    // If user doesn't exist, create
    if (!user) {
      const { data: newUser, error } = await supabase
        .from("users")
        .insert([{ name, email, phone, subscribed: false, balance: 0 }])
        .select()
        .single();
      if (error) throw error;
      user = newUser;
    }

    // Create a magic login token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await supabase.from("sessions").insert([{ user_id: user.id, token, expires_at: expiresAt.toISOString() }]);

    const verifyUrl = `${process.env.FRONTEND_ORIGIN}/verify.html?token=${token}`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "WritersInn Login Verification",
      html: `<p>Hello ${user.name},</p><p>Click the link to login:</p><a href="${verifyUrl}">${verifyUrl}</a><p>Expires in 15 minutes.</p>`,
    });

    res.json({ message: "✅ Verification email sent" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Verify magic link
app.get("/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { data: session } = await supabase.from("sessions").select("*").eq("token", token).single();

    if (!session || new Date(session.expires_at) < new Date()) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const { data: user } = await supabase
      .from("users")
      .select("id,name,email,phone,balance,subscribed")
      .eq("id", session.user_id)
      .single();

    if (!user) return res.status(404).json({ error: "User not found" });

    // Return user object with proper subscribed status
    res.json({ message: "✅ Login successful", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

  