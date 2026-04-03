import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
// In AIS, we'll try to pick up the default credentials or use the project ID.
try {
  admin.initializeApp({
    projectId: "ai-studio-applet-webapp-3b275",
    // credential: admin.credential.applicationDefault() // This is preferred in GCP
  });
  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.error("Error initializing Firebase Admin:", error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Send Notification
  app.post("/api/notifications/send", async (req, res) => {
    const { token, title, body } = req.body;

    if (!token || !title || !body) {
      return res.status(400).json({ error: "Missing required fields: token, title, body" });
    }

    try {
      const message = {
        notification: { title, body },
        token: token,
      };

      const response = await admin.messaging().send(message);
      console.log("Successfully sent message:", response);
      res.json({ success: true, messageId: response });
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send notification", details: String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
