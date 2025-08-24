# 🏥 Insurance Claim Support Agent

AI-powered insurance claim processing agent with human-in-the-loop approval system, built with Portia-style architecture.

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v16 or higher)
- **NPM** package manager
- **Milvus** vector database (local or Zilliz Cloud)

### 1. Clone and Install
```bash
# Navigate to project directory
cd insurance-claim-agent

# Install dependencies
npm install
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your API keys
nano .env  # or use any text editor
```

### 3. Configure API Keys

#### Google Gemini API Key (FREE!)
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Add to `.env`: `GEMINI_API_KEY=AIza...`

#### Gmail App Password Setup (Super Simple!)
1. **Enable 2-Factor Authentication** on your Gmail account
2. Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
3. Select app: "Mail" or "Other (custom name)"
4. Generate 16-character app password
5. Add to `.env`:
   ```
   GMAIL_EMAIL=your_email@gmail.com
   GMAIL_APP_PASSWORD=abcd efgh ijkl mnop  # (remove spaces)
   ```

#### Tavily API Key
1. Sign up at [tavily.com](https://tavily.com)
2. Get API key from dashboard
3. Add to `.env`: `TAVILY_API_KEY=tvly-...`

#### Milvus Setup Options

**Option A: Local Milvus (Docker)**
```bash
# Start Milvus with Docker
curl -sfL https://raw.githubusercontent.com/milvus-io/milvus/master/scripts/standalone_embed.sh | bash -s start

# Add to .env
MILVUS_URI=http://localhost:19530
```

**Option B: Zilliz Cloud (Recommended)**
1. Sign up at [cloud.zilliz.com](https://cloud.zilliz.com)
2. Create new cluster (free tier available)
3. Get connection URI and token
4. Add to `.env`:
   ```
   MILVUS_URI=https://your-cluster.vectordb.zilliz.com:19530
   MILVUS_TOKEN=your_token
   ```

### 4. Test Gmail Connection
```bash
# Test email access (optional)
node -e "
const { google } = require('googleapis');
require('dotenv').config();

const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
);
oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
gmail.users.getProfile({ userId: 'me' })
    .then(res => console.log('✓ Gmail connected:', res.data.emailAddress))
    .catch(err => console.error('✗ Gmail error:', err.message));
"
```

## 🧪 Testing the Agent

### Test Data Preparation

1. **Create test email with documents**:
   - Send an email to your Gmail from the test email address
   - Attach sample medical bill (PDF/DOCX)
   - Include hospital details, treatment info, amounts

2. **Sample test document content**:
   ```
   HOSPITAL BILL
   Patient: John Doe
   Date: 2024-01-15
   Procedure: Emergency Surgery - Appendectomy
   Hospital: City General Hospital
   Total Amount: $5,500
   Insurance Claim Amount: $5,000
   ```

### Run the Agent

```bash
# Start the agent
npm start

# Or directly
node insurance-agent.js
```

### Test Flow

1. **Agent starts** and initializes connections
2. **Enter test data** when prompted:
   ```
   Email: test@example.com
   Insurance Company: ABC Insurance
   Policy: Health Plus Premium
   Purchase Year: 2022
   Claim Reason: Emergency appendectomy surgery
   ```

3. **Agent processes**:
   - ✓ Checks for excluded conditions
   - ✓ Searches Gmail for documents
   - ✓ Searches policy documents online
   - ✓ Creates vector embeddings
   - ✓ Analyzes claim vs policy

4. **Human approval prompt**:
   ```
   🤖 HUMAN-IN-THE-LOOP CLARIFICATION REQUIRED
   ============================================
   Email: test@example.com
   Score: 0.5
   Reason: Covered procedure but requires review
   ============================================
   
   Do you approve this claim? (y/N):
   ```

5. **Final email notifications** sent

## 🔧 Troubleshooting

### Common Issues

**Gmail API Errors**
```bash
# Check OAuth setup
Error: invalid_grant
→ Refresh token expired, generate new one

Error: insufficient permissions  
→ Enable Gmail API in Google Cloud Console
```

**Milvus Connection Issues**
```bash
# Test Milvus connection
node -e "
const { MilvusClient } = require('@milvus-io/milvus2-sdk-node');
const client = new MilvusClient({ address: 'http://localhost:19530' });
client.checkHealth().then(console.log).catch(console.error);
"
```

**Gemini API Errors**
```bash
# Check API key
Error: API_KEY_INVALID
→ Verify API key in .env file

Error: QUOTA_EXCEEDED
→ Check daily quota at AI Studio (free tier has generous limits)
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=* node insurance-agent.js
```

## 📊 Testing Different Scenarios

### 1. Auto-Approve Scenario (Score: 1.0)
- **Condition**: Standard covered procedure
- **Hospital**: Network hospital
- **Documents**: Complete medical records
- **Expected**: Auto-approval email

### 2. Human Review Scenario (Score: 0.5)
- **Condition**: Partially covered procedure
- **Hospital**: Out-of-network
- **Documents**: Incomplete records
- **Expected**: Human review prompt

### 3. Auto-Reject Scenario (Score: 0.0)
- **Condition**: Excluded condition (cosmetic)
- **Hospital**: Any
- **Documents**: Any
- **Expected**: Auto-rejection email

## 📈 Performance Monitoring

The agent logs key metrics:
- **Processing time** for each step
- **Embedding generation** duration
- **API response times**
- **Success/failure rates**

## 🔒 Security Notes

- **Never commit** `.env` file to version control
- **Use separate** API keys for development/production
- **Rotate keys** regularly
- **Monitor API usage** and set billing alerts

## 📝 Production Deployment

1. **Use environment variables** instead of `.env` file
2. **Set up monitoring** and alerting
3. **Configure log aggregation**
4. **Set up backup** for Milvus data
5. **Use production-grade** email service (not personal Gmail)

## 🆘 Support

For issues:
1. Check logs for error messages
2. Verify all API keys are valid
3. Test individual components separately
4. Check network connectivity to services
