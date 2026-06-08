import axios from "axios";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI } from "./config.js";
import { saveTokensToMethod, getTokensFromMethod } from "./db.js";

// ═════════════════════════════════════════════════════════════════════════════
// PART 1 — USER AUTHENTICATION
// ═════════════════════════════════════════════════════════════════════════════

export const initiateAuth = async (req, res) => {
  try {
    const { accountName, userRecordId, methodApiKey, tokenRecordId } = req.body || {};

    if (!accountName || !userRecordId || !methodApiKey || !tokenRecordId) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "Missing required fields: accountName, userRecordId, methodApiKey, tokenRecordId."
      });
    }

    const state = Buffer.from(
      JSON.stringify({ accountName, userRecordId, methodApiKey, tokenRecordId })
    ).toString("base64");

    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/calendar.events",
        access_type: "offline",
        prompt: "consent select_account",
        state
      });

    return res.status(200).json({
      success: true,
      status: "ok",
      authUrl
    });

  } catch (err) {
    console.error("❌ initiateAuth error:", err);
    return res.status(500).json({
      success: false,
      status: "error",
      message: "Server error generating authorization URL."
    });
  }
};

// ─── 1c. Google Callback — Save Tokens to Method (GET) ────────────────────────

export const handleCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;

if (!state) return res.status(400).send("Missing state parameter.");




    if (error) {
      return res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>❌ Connection Cancelled</h2>
          <p>You cancelled the Google authorization.</p>
        </body></html>
      `);
    }

    if (!state) return res.status(400).send("Missing state parameter.");

    const { accountName, userRecordId, methodApiKey, tokenRecordId } = JSON.parse(
      Buffer.from(state, "base64").toString()
    );
    
    // ⭐ NOW the values exist — log them here
console.log("DEBUG methodApiKey:", methodApiKey);
console.log("DEBUG tokenRecordId:", tokenRecordId);
console.log("DEBUG userRecordId:", userRecordId);
console.log("DEBUG accountName:", accountName);

    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code"
      })
    );

    const tokens = tokenRes.data;

    // 🔥 Save tokens directly to the known record
    await saveTokensToMethod(methodApiKey, tokenRecordId, {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_in: tokens.expires_in
    });

    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>✅ Google Calendar Connected!</h2>
        <p>You can close this window.</p>
      </body></html>
    `);

  } catch (err) {
    console.error("❌ handleCallback error:", err.response?.data || err.message);
    return res.status(500).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>❌ Connection Failed</h2>
        <p>${err.message}</p>
      </body></html>
    `);
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// PART 2 — MEETING CREATION
// ═════════════════════════════════════════════════════════════════════════════

export const createEvent = async (req, res) => {
  try {
    const {
      methodApiKey,
      userRecordId,
      tokenRecordId,
      summary,
      location,
      description,
      start,
      end,
      attendees,
      reminders,
      conferenceData
    } = req.body || {};

    if (!methodApiKey || !userRecordId || !tokenRecordId) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "Missing required fields: methodApiKey, userRecordId, tokenRecordId."
      });
    }

    const { accessToken, refreshToken, expiry } = await getTokensFromMethod(
      methodApiKey,
      tokenRecordId
    );

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "No Google Calendar connection found."
      });
    }

    let currentAccessToken = accessToken;
    const isExpired = !expiry || new Date(expiry) <= new Date();

    if (isExpired) {
      const refreshRes = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token"
        })
      );

      currentAccessToken = refreshRes.data.access_token;

      await saveTokensToMethod(methodApiKey, tokenRecordId, {
        refresh_token: refreshToken,
        access_token: currentAccessToken,
        expires_in: refreshRes.data.expires_in
      });
    }

    const eventBody = {
      summary,
      location,
      description,
      start,
      end,
      attendees: attendees ?? [],
      reminders: reminders ?? { useDefault: true },
      conferenceData: conferenceData ?? {
        createRequest: { requestId: "meet-" + Date.now() }
      }
    };

    const eventRes = await axios.post(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
      eventBody,
      {
        headers: { Authorization: `Bearer ${currentAccessToken}` }
      }
    );

    const event = eventRes.data;

    return res.status(200).json({
      success: true,
      status: "ok",
      meetLink: event.conferenceData?.entryPoints?.[0]?.uri ?? null,
      htmlLink: event.htmlLink ?? null,
      eventId: event.id ?? null
    });

  } catch (err) {
    console.error("❌ createEvent error:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      status: "error",
      message: "Failed to create event.",
      detail: err.response?.data || err.message
    });
  }
};
