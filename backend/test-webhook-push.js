const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const secret = process.env.GITHUB_WEBHOOK_SECRET || 'secdevops_whsec_7b8d9e2a4f1c6a305e9d2c8f';
const smeeUrl = process.env.SMEE_URL || 'https://smee.io/4Dskqsw7XjXJssg7';
const targetUrl = process.argv[2] === '--local'
  ? 'http://localhost:4000/api/webhooks/github'
  : smeeUrl;

const payload = JSON.stringify({
  after: 'main',
  ref: 'refs/heads/main',
  repository: {
    full_name: 'ayanozoro/auth_service',
    name: 'auth_service',
    owner: { login: 'ayanozoro' },
  },
  head_commit: {
    id: 'main',
    message: 'Simulated push event for security scan test',
  },
});

const hmac = crypto.createHmac('sha256', secret);
hmac.update(payload);
const signature = 'sha256=' + hmac.digest('hex');

console.log(`📡 Sending test GitHub push webhook to: ${targetUrl}`);
console.log(`📦 Target Repository: ayanozoro/auth_service (ref: refs/heads/main)`);

fetch(targetUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-github-event': 'push',
    'x-github-delivery': 'simulated-push-' + Date.now(),
    'x-hub-signature-256': signature,
  },
  body: payload,
})
  .then(async (res) => {
    console.log(`\n✅ Status: ${res.status} ${res.statusText}`);
    try {
      const data = await res.json();
      console.log('📄 Response Body:\n', JSON.stringify(data, null, 2));
    } catch {
      const text = await res.text();
      console.log('📄 Response Text:\n', text);
    }
  })
  .catch((err) => {
    console.error('❌ Request failed:', err.message);
  });
