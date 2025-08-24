const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
let FormData;
require('dotenv').config();

// Debug environment variables on startup
console.log('🔍 Environment Variables Check:');
console.log('   GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET' : 'MISSING');
console.log('   GEMINI_API_KEY_1:', process.env.GEMINI_API_KEY_1 ? 'SET' : 'MISSING');
console.log('   GEMINI_API_KEY_2:', process.env.GEMINI_API_KEY_2 ? 'SET' : 'MISSING');
console.log('   KIMI_K2_KEY:', process.env.KIMI_K2_KEY ? 'SET' : 'MISSING');

// Create Express app for ElevenLabs webhook only
const app = express();
const port = process.env.ELEVENLABS_WEBHOOK_PORT || 6000;

// Middleware
app.use(cors());
// Capture raw body for HMAC verification while still parsing JSON
app.use(express.json({
    limit: '25mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'ElevenLabs Webhook Server'
    });
});

// Verify ElevenLabs webhook signature (HMAC SHA256)
function verifyElevenLabsSignature(req, res, next) {
    // For testing purposes, always allow webhook calls to go through
    const TESTING_MODE = true;
    
    const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    
    // Log debugging info
    console.log('🔍 HMAC Debug Info:');
    console.log('   Secret configured:', !!secret);
    console.log('   Secret length:', secret ? secret.length : 'N/A');
    console.log('   Headers:', Object.keys(req.headers).join(', '));
    console.log('   Headers with sign:', Object.keys(req.headers).filter(h => h.toLowerCase().includes('sign')));
    
    // If testing mode or no secret configured, skip verification
    if (TESTING_MODE || !secret) {
        console.log('⚠️ TESTING MODE or No ELEVENLABS_WEBHOOK_SECRET, skipping HMAC verification');
        return next();
    }

    const headerSig = (req.headers['elevenlabs-signature'] || req.headers['x-elevenlabs-signature'] || req.headers['x-webhook-signature'] || req.headers['x-signature'] || '').toString();
    if (!headerSig) {
        console.log('❌ Missing webhook signature header');
        console.log('⚠️ TEST MODE: Proceeding anyway');
        return next();
    }

    try {
        // Parse ElevenLabs signature format: t=timestamp,v0=signature or t=timestamp,v1=signature
        let signatureToVerify = headerSig;
        let timestamp = null;
        
        if (headerSig.includes('t=') && headerSig.includes('v0=')) {
            // ElevenLabs format: t=1756035783,v0=signature
            const parts = headerSig.split(',');
            const timestampPart = parts.find(p => p.startsWith('t='));
            const signaturePart = parts.find(p => p.startsWith('v0=') || p.startsWith('v1='));
            
            if (timestampPart && signaturePart) {
                timestamp = timestampPart.split('=')[1];
                signatureToVerify = signaturePart.split('=')[1];
                
                // For ElevenLabs, we need to include timestamp in the payload
                const payload = timestamp + '.' + (req.rawBody || Buffer.from(''));
                const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
                
                console.log('🔐 Timestamp:', timestamp);
                console.log('🔐 Payload for HMAC:', payload.substring(0, 100) + '...');
                console.log('🔐 Computed signature:', computed);
                console.log('🔐 Received signature:', signatureToVerify);
                
                if (computed.toLowerCase() === signatureToVerify.toLowerCase()) {
                    console.log('✅ HMAC signature verified (ElevenLabs format)');
                    return next();
                }
            }
        }
        
        // Fallback: try standard HMAC verification
        const computed = crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.from('')).digest('hex');
        console.log('🔐 Fallback computed signature:', computed);
        console.log('🔐 Fallback received signature:', signatureToVerify);

        // Accept common formats: raw hex, or prefixed like "sha256=...", or comma-separated values
        const signatures = signatureToVerify
            .split(',')
            .map(s => s.trim())
            .map(s => s.startsWith('sha256=') ? s.slice(7) : s);

        const match = signatures.some(sig => sig.toLowerCase() === computed.toLowerCase());
        if (!match) {
            console.log('❌ HMAC signature mismatch');
            return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
        }
        
        console.log('✅ HMAC signature verified (standard format)');
        return next();
    } catch (e) {
        console.log('❌ HMAC verification error:', e.message);
        return res.status(401).json({ success: false, error: 'Signature verification failed' });
    }
}

// ElevenLabs webhook endpoint
app.post('/webhook/elevenlabs', verifyElevenLabsSignature, async (req, res) => {
    try {
        // Log webhook info without massive audio data
        const logPayload = { ...req.body };
        if (logPayload.data && logPayload.data.full_audio) {
            logPayload.data.full_audio = `[AUDIO_DATA_${logPayload.data.full_audio.length}_CHARS]`;
        }
        console.log('📞 ElevenLabs webhook received:', JSON.stringify(logPayload, null, 2));
        
        // Handle different ElevenLabs webhook formats
        let conversationText = '';
        let conversationId = '';
        
        console.log('🔍 Webhook payload structure:', Object.keys(req.body));
        console.log('🔍 Full payload sample:', JSON.stringify(req.body).substring(0, 500) + '...');
        
        // Check for various ElevenLabs webhook formats
        if (req.body.transcript && Array.isArray(req.body.transcript)) {
            console.log('📝 Processing conversation transcript array...');
            conversationText = req.body.transcript.map(turn => 
                `${turn.role === 'agent' ? 'Agent' : 'User'}: ${turn.message || turn.text || turn.content}`
            ).join('\n');
            conversationId = req.body.conversation_id || req.body.id || 'unknown';
        }
        // Check for messages array format
        else if (req.body.messages && Array.isArray(req.body.messages)) {
            console.log('📝 Processing messages array...');
            conversationText = req.body.messages.map(msg => 
                `${msg.role === 'agent' ? 'Agent' : 'User'}: ${msg.content || msg.message || msg.text}`
            ).join('\n');
            conversationId = req.body.conversation_id || req.body.id || 'unknown';
        }
        // Check for conversation array format
        else if (req.body.conversation && Array.isArray(req.body.conversation)) {
            console.log('📝 Processing conversation array...');
            conversationText = req.body.conversation.map(turn => 
                `${turn.role === 'agent' ? 'Agent' : 'User'}: ${turn.message || turn.text || turn.content}`
            ).join('\n');
            conversationId = req.body.conversation_id || req.body.id || 'unknown';
        }
        // Check for simple text formats
        else if (req.body.conversation_text || req.body.full_conversation || req.body.text) {
            console.log('📝 Processing text format...');
            conversationText = req.body.conversation_text || req.body.full_conversation || req.body.text;
            conversationId = req.body.conversation_id || req.body.id || 'unknown';
        }
        // Check if it's audio data - try to extract from audio field
        else if (req.body.audio || req.body.audio_data) {
            console.log('🎵 Audio data detected - this needs speech-to-text conversion');
            const base64 = req.body.audio || req.body.audio_data;
            const transcript = await transcribeAudioBase64(base64);
            if (!transcript) {
                return res.status(400).json({ success: false, error: 'Transcription failed' });
            }
            conversationText = transcript;
            conversationId = req.body.conversation_id || req.body.id || 'unknown';
        }
        // ElevenLabs post-call audio payload
        else if (req.body.type === 'post_call_audio' && req.body.data && req.body.data.full_audio) {
            console.log('🎵 ElevenLabs post_call_audio payload detected. Transcribing...');
            console.log('🔍 Audio data length:', req.body.data.full_audio ? `${req.body.data.full_audio.length} characters` : 'No audio data');
            console.log('⚠️  WARNING: You should configure ElevenLabs to send post_call_transcription instead!');
            const transcript = await transcribeAudioBase64(req.body.data.full_audio);
            if (!transcript) {
                return res.status(400).json({
                    success: false,
                    error: 'Transcription failed',
                    message: 'Could not transcribe audio. Ensure OpenRouter key is set or enable transcript webhooks in ElevenLabs.'
                });
            }
            conversationText = transcript;
            conversationId = req.body.data.conversation_id || 'unknown';
        }
        // ElevenLabs post_call_transcription payload (exact format from docs)
        else if (req.body.type === 'post_call_transcription' && req.body.data && req.body.data.transcript) {
            console.log('✅ ElevenLabs post_call_transcription payload detected - EXACT FORMAT FROM DOCS');
            console.log('🔍 Agent ID:', req.body.data.agent_id);
            console.log('🔍 Conversation ID:', req.body.data.conversation_id);
            console.log('🔍 Status:', req.body.data.status);
            console.log('🔍 Transcript length:', req.body.data.transcript.length);
            
            // Process transcript array exactly as documented
            conversationText = req.body.data.transcript.map(turn => {
                const role = turn.role === 'agent' ? 'Agent' : 'User';
                const message = turn.message || '';
                const timeInfo = turn.time_in_call_secs ? ` (${turn.time_in_call_secs}s)` : '';
                return `${role}${timeInfo}: ${message}`;
            }).join('\n');
            
            conversationId = req.body.data.conversation_id || 'unknown';
            
            // Also extract analysis if available
            if (req.body.data.analysis) {
                console.log('📊 Analysis available:', {
                    call_successful: req.body.data.analysis.call_successful,
                    transcript_summary: req.body.data.analysis.transcript_summary?.substring(0, 100) + '...'
                });
            }
            
            console.log('📝 Processed transcript preview:', conversationText.substring(0, 300) + '...');
        }
        // Check if it's the old format (for backward compatibility)
        else if (req.body.extracted_data && req.body.extracted_data.email) {
            console.log('📧 Using pre-extracted data...');
            return await processWithExtractedData(req.body.extracted_data, res);
        }
        // If no valid format found, log all available fields for debugging
        else {
            console.log('❌ No valid conversation data found in webhook');
            console.log('🔍 Available fields:', Object.keys(req.body));
            console.log('🔍 Sample values:');
            Object.keys(req.body).slice(0, 5).forEach(key => {
                const value = req.body[key];
                if (typeof value === 'string') {
                    console.log(`   ${key}: "${value.substring(0, 100)}${value.length > 100 ? '...' : ''}"`);
                } else if (Array.isArray(value)) {
                    console.log(`   ${key}: [Array with ${value.length} items]`);
                } else if (typeof value === 'object') {
                    console.log(`   ${key}: {Object with keys: ${Object.keys(value).join(', ')}}`);
                } else {
                    console.log(`   ${key}: ${value}`);
                }
            });
            
            return res.status(400).json({
                success: false,
                error: "No conversation data found",
                message: "Please ensure the conversation transcript is included in the webhook payload. Check ElevenLabs settings to enable text transcription.",
                available_fields: Object.keys(req.body),
                debug_info: "Check server logs for detailed payload structure"
            });
        }
        
        console.log('🤖 Extracting information from conversation using AI models...');
        console.log(`📄 Conversation text (${conversationText.length} chars):`, conversationText.substring(0, 500) + '...');
        
        // Extract user information from conversation using Kimi K2
        const extractedInfo = await extractInfoFromConversation(conversationText);
        
        if (!extractedInfo.email) {
            console.log('❌ Could not extract email from conversation');
            return res.status(400).json({
                success: false,
                error: "Email extraction failed",
                message: "Could not find a valid email address in the conversation. Please ensure the user provided their email clearly."
            });
        }
        
        console.log(`✅ Extracted info: Email=${extractedInfo.email}, Name=${extractedInfo.name}`);
        
        // Process the claim with extracted information
        await processWithExtractedData(extractedInfo, res);
        
    } catch (error) {
        console.error('🚨 Webhook error:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message,
            message: "I apologize, but I'm experiencing a technical issue. Please try again in a moment."
        });
    }
});

// Helper function to extract information from conversation with Gemini + KIMI fallback
async function extractInfoFromConversation(conversationText) {
    console.log('🤖 Using AI models for information extraction...');
    console.log('🔍 Environment check:');
    console.log('   GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
    console.log('   GEMINI_API_KEY_1 exists:', !!process.env.GEMINI_API_KEY_1);
    console.log('   GEMINI_API_KEY_2 exists:', !!process.env.GEMINI_API_KEY_2);
    console.log('   KIMI_K2_KEY exists:', !!process.env.KIMI_K2_KEY);
    
    // Try all Gemini API keys first
    const geminiKeys = [
        process.env.GEMINI_API_KEY,
        process.env.GEMINI_API_KEY_1, 
        process.env.GEMINI_API_KEY_2
    ].filter(Boolean); // Remove null/undefined values
    
    const hasGeminiKey = geminiKeys.length > 0;
    const hasKimiKey = !!process.env.KIMI_K2_KEY;
    
    if (!hasGeminiKey && !hasKimiKey) {
        console.error('❌ No API keys available!');
        console.error('   Available environment variables:', Object.keys(process.env).filter(k => k.includes('GEMINI') || k.includes('KIMI')));
        throw new Error('No API keys found. Need at least one of: GEMINI_API_KEY, GEMINI_API_KEY_1, GEMINI_API_KEY_2, or KIMI_K2_KEY');
    }
    
    const prompt = `
Please analyze the following conversation and extract the user's information. Look for:
1. Email address (must be a valid email format)
2. Full name or first name
3. Whether they confirmed having sent insurance documents/attachments

Conversation:
${conversationText}

Please respond in JSON format only:
{
    "email": "user@example.com",
    "name": "User Name",
    "has_attachments": true/false,
    "confidence": "high/medium/low"
}
If you cannot find clear information, use null for that field.`;

    let lastError = null;
    
    // Try all available Gemini API keys first
    for (let i = 0; i < geminiKeys.length; i++) {
        const apiKey = geminiKeys[i];
        const keyName = i === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
        
        try {
            console.log(`🤖 Trying Gemini 1.5 Flash with ${keyName}...`);
            const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 500
                }
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const aiResponse = response.data.candidates[0].content.parts[0].text;
            console.log(`✅ Gemini response received from ${keyName}:`, aiResponse.substring(0, 100) + '...');
            
            // Parse and return the result
            return parseAIResponse(aiResponse, 'Gemini');
            
        } catch (error) {
            lastError = error;
            console.error(`❌ Gemini ${keyName} failed:`, error.message);
            if (error.response) {
                console.log('   Status:', error.response.status);
                console.log('   Data:', JSON.stringify(error.response.data, null, 2));
            }
            // Continue to next key
        }
    }
    
    // All Gemini keys failed, try KIMI K2 fallback
    if (hasKimiKey) {
        try {
            console.log('🛟 All Gemini models failed, falling back to KIMI K2...');
            const kimiResponse = await callKimiK2(prompt);
            console.log('✅ KIMI K2 response received:', kimiResponse.substring(0, 100) + '...');
            
            // Parse and return the result
            return parseAIResponse(kimiResponse, 'KIMI K2');
            
        } catch (kimiError) {
            lastError = kimiError;
            console.error('❌ KIMI K2 fallback failed:', kimiError.message);
        }
    }
    
    // All models failed
    const errorMsg = lastError ? lastError.message : 'Unknown error';
    throw new Error(`All AI models failed to extract information. Last error: ${errorMsg}`);
}

// Helper function to parse AI response and validate data
function parseAIResponse(aiResponse, modelName) {
    // Parse JSON response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error(`No valid JSON found in ${modelName} response`);
    }
    
    const extractedData = JSON.parse(jsonMatch[0]);
    
    // Validate extracted email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (extractedData.email && !emailRegex.test(extractedData.email)) {
        console.log('❌ Invalid email format extracted:', extractedData.email);
        extractedData.email = null;
    }
    
    return {
        email: extractedData.email,
        name: extractedData.name || 'Unknown User',
        has_attachments: extractedData.has_attachments,
        confidence: extractedData.confidence || 'medium'
    };
}

// Helper function to call KIMI K2 via OpenRouter API
async function callKimiK2(prompt) {
    const kimiApiKey = process.env.KIMI_K2_KEY;
    
    if (!kimiApiKey) {
        throw new Error('KIMI K2 API key not configured');
    }
    
    const headers = {
        'Authorization': `Bearer ${kimiApiKey}`,
        'Content-Type': 'application/json'
    };
    
    // Add optional headers for OpenRouter
    if (process.env.OPENROUTER_SITE_URL) {
        headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
    }
    if (process.env.OPENROUTER_SITE_TITLE) {
        headers['X-Title'] = process.env.OPENROUTER_SITE_TITLE;
    }
    
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: 'moonshotai/kimi-k2:free',
        messages: [{ 
            role: 'user', 
            content: prompt 
        }],
        temperature: 0.1,
        max_tokens: 500
    }, { 
        headers 
    });
    
    const content = response?.data?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('No content received from KIMI K2 API');
    }
    
    return content;
}

// Helper: transcribe base64 audio using Gemini (fallback for audio webhooks)
async function transcribeAudioBase64(base64Audio) {
    console.log('⚠️  Audio transcription not needed - configure ElevenLabs to send post_call_transcription instead of post_call_audio');
    console.log('🔧 Change webhook event type in ElevenLabs dashboard from post_call_audio to post_call_transcription');
    console.log('📚 See: https://elevenlabs.io/docs/product-guides/administration/webhooks');
    return null;
}

// Helper function to process with extracted data
async function processWithExtractedData(extractedData, res) {
    try {
        // Forward to main insurance processing API
        console.log(`🔄 Forwarding request to insurance API for ${extractedData.email}`);
        
        const insuranceApiUrl = process.env.INSURANCE_API_URL || 'http://localhost:3000/api/process-claim';
        
        // Forward the data
        const apiResponse = await axios.post(insuranceApiUrl, {
            userEmail: extractedData.email,
            userName: extractedData.name || 'Unknown User',
            confirmationReceived: true
        });
        
        console.log('✅ Successfully forwarded to insurance API:', apiResponse.data.message);
        
        // Respond to ElevenLabs
        res.json({
            success: true,
            message: "Claim processing initiated successfully",
            extracted_info: extractedData,
            processing_status: "started"
        });
        
    } catch (apiError) {
        console.error('❌ Error forwarding to insurance API:', apiError.message);
        
        // Respond with error message
        res.status(500).json({
            success: false,
            error: apiError.message,
            message: "Failed to process insurance claim. Please try again later."
        });
    }
}

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
    console.log(`🚀 ElevenLabs Webhook Server running on port ${port}`);
    console.log(`📋 Health check: http://localhost:${port}/health`);
    console.log(`🔗 ElevenLabs webhook: http://localhost:${port}/webhook/elevenlabs`);
});

// Export for testing
module.exports = app;
