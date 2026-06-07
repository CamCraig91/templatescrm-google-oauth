import dotenv from "dotenv";
dotenv.config();

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
export const REDIRECT_URI = process.env.REDIRECT_URI || "http://localhost:4000/oauth/callback";
export const PORT = process.env.PORT || 4000;