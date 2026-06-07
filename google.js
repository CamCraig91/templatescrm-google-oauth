import axios from "axios";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI } from "./config.js";
import { saveTokensToMethod, getTokensFromMethod } from "./db.js";

// ═════════════════════════════════════════════════════════════════════════════
// PART 1 — USER AUTHENTICATION
// ═════════════════════════════════════════════════════════════════════════════

// ─── 1a. Generate Auth URL ────────────────────────────────────────────────────

export const initiateAuth = (req, res) => {
  const { accountName, userRecordId, methodApiKey } = req.body;

  if (!accountName || !userRecordId || !methodApiKey) {
    return res.status(400).json({
      success: false,
      status: "error",
      message: "Missing required fields: accountName, userRecordId, or methodApiKey."
    });
  }

  try {
    const state = Buffer.from(
      JSON.stringify({ accountName, userRecordId, methodApiKey })
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

    console.log(`🔗 Auth URL generated for accountName: ${accountName}, user: ${userRecordId}`);

    res.status(200).json({
      success: true,
      status: "ok",
      message: "Authorization URL generated successfully.",
      authUrl
    });

  } catch (err) {
    console.error("❌ initiateAuth error:", err.message);
    res.status(500).json({
      success: false,
      status: "error",
      message: "Server error generating authorization URL."
    });
  }
};

// ─── 1b. Local Testing Only ───────────────────────────────────────────────────

export const startAuth = (req, res) => {
  const { accountName, userRecordId, methodApiKey } = req.query;

  if (!accountName || !userRecordId || !methodApiKey) {
    return res.status(400).send("Missing required params: accountName, userRecordId, methodApiKey");
  }

  const state = Buffer.from(
    JSON.stringify({ accountName, userRecordId, methodApiKey })
  ).toString("base64");

  const url =
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

  console.log(`🔗 Local test OAuth start — accountName: ${accountName}, user: ${userRecordId}`);
  res.redirect(url);
};

// ─── 1c. Google Callback — Save Tokens to Method ──────────────────────────────

export const handleCallback = async (req, res) => { console.log("ENV DEBUG:", {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: GOOGLE_CLIENT_SECRET?.slice(0, 4) + "...",
  REDIRECT_URI
});
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error("OAuth cancelled or error from Google:", error);
      return res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>❌ Connection Cancelled</h2>
          <p>You cancelled the Google authorization. You can close this window.</p>
        </body></html>
      `);
    }


    if (!state) return res.status(400).send("Missing state parameter.");

    const { accountName, userRecordId, methodApiKey } = JSON.parse(
      Buffer.from(state, "base64").toString()
    );

    console.log(`📥 Callback received — accountName: ${accountName}, user: ${userRecordId}`);

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

    console.log("✅ Tokens received. Has refresh token:", !!tokens.refresh_token);

    await saveTokensToMethod(methodApiKey, userRecordId, {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_in: tokens.expires_in
    });

    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>✅ Google Calendar Connected!</h2>
        <p>Your Google Calendar has been linked successfully.</p>
        <p>You can close this window and return to Method.</p>
      </body></html>
    `);

  } catch (err) {
    console.error("❌ handleCallback error:", err.response?.data || err.message);
    res.status(500).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>❌ Connection Failed</h2>
        <p>Something went wrong. Please try again or contact support.</p>
        <small>${err.message}</small>
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
      summary,
      location,
      description,
      start,
      end,
      attendees,
      reminders,
      conferenceData
    } = req.body;

    if (!methodApiKey || !userRecordId) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "Missing required fields: methodApiKey or userRecordId."
      });
    }

    if (!summary || !start || !end) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "Missing required fields: summary, start, or end."
      });
    }

    const { accessToken, refreshToken, expiry } = await getTokensFromMethod(
      methodApiKey,
      userRecordId
    );

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "No Google Calendar connection found. User must connect Google Calendar first."
      });
    }

    let currentAccessToken = accessToken;
    const isExpired = !expiry || new Date(expiry) <= new Date();

    if (isExpired) {
      console.log("🔄 Access token expired, refreshing...");

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

      const newExpiry = new Date(
        Date.now() + refreshRes.data.expires_in * 1000
      ).toISOString();

      await saveTokensToMethod(methodApiKey, userRecordId, {
        refresh_token: refreshToken,
        access_token: currentAccessToken,
        expires_in: refreshRes.data.expires_in
      });

      console.log("✅ Access token refreshed.");
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

    const meetLink = event.conferenceData?.entryPoints?.[0]?.uri ?? null;

    console.log("✅ Event created:", meetLink);

    res.status(200).json({
      success: true,
      status: "ok",
      message: "Meeting created successfully.",
      meetLink,
      htmlLink: event.htmlLink ?? null,
      eventId: event.id ?? null,
      summary: event.summary,
      startTime: event.start?.dateTime ?? null,
      endTime: event.end?.dateTime ?? null,
      attendees: event.attendees ?? []
    });

  } catch (err) {
    console.error("❌ createEvent error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      status: "error",
      message: "Failed to create event.",
      detail: err.response?.data || err.message
    });
  }
};
