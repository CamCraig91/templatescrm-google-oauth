import { handleCallback } from "../google.js";

export const config = {
  runtime: "nodejs"
};

export default function handler(req, res) {
  if (req.method === "GET") {
    return handleCallback(req, res);
  }
  return res.status(405).json({ error: "Method not allowed" });
}
