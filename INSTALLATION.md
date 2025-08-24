# Enhanced Insurance Claim Agent - Installation Guide

## Prerequisites

- **Node.js**: Version 16.0.0 or higher
- **npm**: Version 8.0.0 or higher (comes with Node.js)
- **Git**: For cloning the repository

## Installation Steps

### 1. Clone the Repository
```bash
git clone <your-repository-url>
cd insurance-claim-agent-copy-3
```

### 2. Install Dependencies
```bash
# Install all required dependencies
npm install

# Or use the custom script
npm run install-deps
```

### 3. Environment Setup
Create a `.env` file in the root directory with the following variables:

```env
# Gemini AI API Keys (Primary + Backup)
GEMINI_API_KEY=your_primary_gemini_api_key
GEMINI_API_KEY_1=your_backup_gemini_api_key_1
GEMINI_API_KEY_2=your_backup_gemini_api_key_2

# Milvus Vector Database
MILVUS_URI=your_milvus_cluster_uri
MILVUS_TOKEN=your_milvus_token

# Email Configuration
GMAIL_EMAIL=your_gmail_address
GMAIL_APP_PASSWORD=your_gmail_app_password
COMPANY_EMAIL=your_company_email

# OpenAI/Kimi K2 Fallback (Optional)
KIMI_K2_KEY=your_openrouter_api_key

# ElevenLabs (Optional - for voice features)
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

### 4. Verify Installation
```bash
# Check if all dependencies are installed correctly
npm run health-check

# Test the basic functionality
npm test
```

## Dependencies Overview

### Core Dependencies
- **@google/generative-ai**: Google's Gemini AI SDK
- **@zilliz/milvus2-sdk-node**: Milvus vector database client
- **axios**: HTTP client for API requests
- **cors**: Cross-origin resource sharing middleware
- **dotenv**: Environment variable loader
- **express**: Web framework for API server

### Email & Communication
- **imap**: IMAP client for reading emails
- **mailparser**: Email parsing utilities
- **nodemailer**: Email sending capabilities

### Document Processing
- **mammoth**: Microsoft Word document processing
- **pdf-parse**: PDF document parsing
- **node-html-parser**: HTML parsing utilities

### AI & Fallback
- **openai**: OpenAI client (used for Kimi K2 fallback)
- **readline-sync**: Synchronous user input handling

### WebSocket & Real-time
- **ws**: WebSocket implementation

### Development
- **nodemon**: Development server with auto-restart

## Available Scripts

### Production Scripts
```bash
npm start              # Start the enhanced insurance agent
npm run server         # Start the API server
npm run webhook        # Start ElevenLabs webhook server
```

### Development Scripts
```bash
npm run dev            # Start server in development mode
npm run dev-webhook    # Start webhook in development mode
```

### Testing Scripts
```bash
npm test               # Run basic tests
npm run test-api       # Test API endpoints
npm run test-email     # Test email functionality
npm run test-webhook   # Test webhook functionality
```

### Database Scripts
```bash
npm run db:schema      # Set up database schemas
npm run db:seed        # Seed with demo data
npm run db:populate    # Populate policy collection
npm run db:setup       # Complete database setup
```

### Utility Scripts
```bash
npm run health-check   # Verify installation
npm run clean          # Clean install (removes node_modules)
```

## Troubleshooting

### Common Issues

1. **Node.js Version Error**
   ```bash
   # Check your Node.js version
   node --version
   
   # Should be 16.0.0 or higher
   ```

2. **Missing Dependencies**
   ```bash
   # Clean reinstall
   npm run clean
   ```

3. **API Key Issues**
   - Ensure all required API keys are in your `.env` file
   - Check that API keys are valid and have proper permissions

4. **Network Issues**
   ```bash
   # Clear npm cache
   npm cache clean --force
   
   # Try installing with verbose logging
   npm install --verbose
   ```

### Getting Help

If you encounter issues:
1. Check the console output for specific error messages
2. Verify all environment variables are set correctly
3. Ensure you have the required Node.js version
4. Try a clean installation with `npm run clean`

## Next Steps

After successful installation:
1. Configure your `.env` file with valid API keys
2. Run `npm run db:setup` to initialize the database
3. Test the system with `npm test`
4. Start the server with `npm run dev`

Your Enhanced Insurance Claim Agent should now be ready to use!
