import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import open from 'open';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');
const TOKEN_PATH = path.join(__dirname, '..', '.token.json');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Missing ${CREDENTIALS_PATH}. See ingest/README.md step 1b to create a Desktop app OAuth client and download its JSON here.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  return raw.installed || raw.web;
}

async function interactiveAuth(oAuth2Client) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const code = url.searchParams.get('code');
        if (!code) return;
        res.end('Signed in. You can close this tab and return to the terminal.');
        server.close();
        const { tokens } = await oAuth2Client.getToken(code);
        resolve(tokens);
      } catch (err) {
        res.end('Auth failed, check the terminal.');
        server.close();
        reject(err);
      }
    });

    server.listen(0, () => {
      const port = server.address().port;
      oAuth2Client.redirectUri = `http://localhost:${port}`;
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        redirect_uri: oAuth2Client.redirectUri,
      });
      console.log('Opening browser for Google sign-in...');
      console.log(`If it doesn't open automatically, visit:\n${authUrl}\n`);
      open(authUrl);
    });
  });
}

export async function getDriveClient() {
  const creds = loadCredentials();
  const oAuth2Client = new google.auth.OAuth2(creds.client_id, creds.client_secret);

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
  } else {
    const tokens = await interactiveAuth(oAuth2Client);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  }

  oAuth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      const merged = { ...oAuth2Client.credentials, ...tokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    }
  });

  return google.drive({ version: 'v3', auth: oAuth2Client });
}
