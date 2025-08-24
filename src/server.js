const express = require('express');
const cors = require('cors');
const { EnhancedInsuranceAgent } = require('./agents/enhanced-insurance-agent');

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Insurance Agent
const insuranceAgent = new EnhancedInsuranceAgent();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'Enhanced Insurance Claim Agent'
    });
});

// Main endpoint for ElevenLabs integration
app.post('/api/process-claim', async (req, res) => {
    try {
        console.log('🔍 Received claim processing request:', req.body);
        
        let { userEmail, userName, confirmationReceived } = req.body;
        
        // Convert email to lowercase if it's in uppercase (from automation agent)
        if (userEmail && typeof userEmail === 'string') {
            userEmail = userEmail.toLowerCase();
        }
        
        // Validate required fields
        if (!userEmail || !confirmationReceived) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userEmail and confirmationReceived',
                message: 'Please provide user email and confirmation that attachments were sent'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userEmail)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format',
                message: 'Please provide a valid email address'
            });
        }

        console.log(`🚀 Starting automated claim processing for: ${userEmail}`);
        
        // Process claim automatically (without terminal input)
        const result = await insuranceAgent.processClaimAutomatically(userEmail, userName);
        
        // Return success response
        res.json({
            success: true,
            message: 'Claim processing initiated successfully',
            data: {
                userEmail,
                userName,
                claimId: result.claimId,
                status: result.status,
                validationSummary: result.validationSummary,
                nextSteps: result.nextSteps
            }
        });

    } catch (error) {
        console.error('❌ Error processing claim:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to process insurance claim. Please try again or contact support.'
        });
    }
});

// Endpoint for checking claim status
app.get('/api/claim-status/:email', async (req, res) => {
    try {
        let { email } = req.params;
        
        // Convert email to lowercase if it's in uppercase (from automation agent)
        if (email && typeof email === 'string') {
            email = email.toLowerCase();
        }
        
        // Get claim status from database
        const claimStatus = await insuranceAgent.getClaimStatus(email);
        
        res.json({
            success: true,
            data: claimStatus
        });
        
    } catch (error) {
        console.error('❌ Error fetching claim status:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to fetch claim status'
        });
    }
});

// Endpoint for ElevenLabs webhook testing
app.post('/api/webhook/elevenlabs', (req, res) => {
    console.log('📞 ElevenLabs webhook received:', req.body);
    
    // Process webhook data and trigger claim processing
    const { conversation_id, user_message, extracted_data } = req.body;
    
    if (extracted_data && extracted_data.email) {
        // Convert email to lowercase if it's in uppercase (from automation agent)
        const userEmail = extracted_data.email.toLowerCase();
        
        // Trigger claim processing asynchronously
        insuranceAgent.processClaimAutomatically(
            userEmail, 
            extracted_data.name || 'Unknown'
        ).catch(err => console.error('Webhook processing error:', err));
    }
    
    // Respond to ElevenLabs
    res.json({
        success: true,
        response: "Thank you! I've received your information and started processing your insurance claim. You'll receive an email confirmation shortly.",
        action: "continue_conversation"
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('🚨 Server error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Something went wrong. Please try again later.'
    });
});

// Handle 404
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        message: 'The requested endpoint does not exist'
    });
});

// Start server
app.listen(port, () => {
    console.log(`🚀 Enhanced Insurance Claim Server running on port ${port}`);
    console.log(`📋 Health check: http://localhost:${port}/health`);
    console.log(`🔗 Claim processing: http://localhost:${port}/api/process-claim`);
    console.log(`📞 ElevenLabs webhook: http://localhost:${port}/api/webhook/elevenlabs`);
});

module.exports = app;
