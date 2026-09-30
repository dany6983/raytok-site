import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    sub: 'dev',
    days: 30,
    flags: 6,
    secret: process.env.LICENSE_SECRET
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sub' && args[i + 1]) {
      options.sub = args[++i];
    } else if (args[i] === '--days' && args[i + 1]) {
      options.days = parseFloat(args[++i]);
    } else if (args[i] === '--flags' && args[i + 1]) {
      options.flags = parseInt(args[++i], 10);
    } else if (args[i] === '--secret' && args[i + 1]) {
      options.secret = args[++i];
    }
  }

  if (!options.secret) {
    // Try reading from .dev.vars if available
    const devVarsPath = path.resolve(__dirname, '../.dev.vars');
    if (fs.existsSync(devVarsPath)) {
      const lines = fs.readFileSync(devVarsPath, 'utf8').split('\n');
      for (const line of lines) {
        const match = line.match(/^LICENSE_SECRET=(.*)$/);
        if (match) {
          options.secret = match[1].trim();
          break;
        }
      }
    }
  }

  return options;
}

export function mintLicenseToken({ sub, days, flags, secret }) {
  if (!secret) {
    throw new Error('LICENSE_SECRET is required to mint token');
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = Math.floor(iat + days * 86400);

  const payloadObj = {
    sub,
    exp,
    flags: Number(flags),
    iat
  };

  const payloadJson = JSON.stringify(payloadObj);
  const b64Payload = Buffer.from(payloadJson, 'utf8').toString('base64url');
  const b64Sig = crypto.createHmac('sha256', secret).update(payloadJson, 'utf8').digest('base64url');

  return `${b64Payload}.${b64Sig}`;
}

// Run CLI if called directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const opts = parseArgs();
  try {
    const token = mintLicenseToken(opts);
    console.log(token);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
