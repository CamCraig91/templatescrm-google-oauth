import express from "express";
import cors from "cors";
import { initiateAuth, handleCallback, createEvent } from "./google.js";
import { PORT } from "./config.js";

const app = express();
app.use(express.json());

app.use(cors({
  origin: [
    "https://templatescrm.ca",
    "https://app.method.me",
    "http://localhost:4000",
    "http://localhost:3001"
  ],
  methods: ["GET", "POST", "PATCH"],
  credentials: true
}));

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Google OAuth server is running." });
});

app.post("/initiate-auth", initiateAuth);
app.get("/oauth/start", startAuth);
app.get("/oauth/callback", handleCallback);
app.post("/create-event", createEvent);

// Local dev only
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => console.log(`🚀 OAuth server running on port ${PORT}`));
}

// Vercel uses the default export
export default app;
