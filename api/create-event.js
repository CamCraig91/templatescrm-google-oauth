import { createEvent } from "../google.js";

export const config = {
  runtime: "nodejs"
};

export default function handler(req, res) {
  if (req.method === "POST") {
    return createEvent(req, res);
  }
  return res.status(405).json({ error: "Method not allowed" });
}
