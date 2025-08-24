#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline-sync');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { MilvusClient } = require('@zilliz/milvus2-sdk-node');
const axios = require('axios');
const nodemailer = require('nodemailer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { parse } = require('node-html-parser');

require('dotenv').config();

class InsuranceClaimAgent {
    constructor() {
        // Initialize APIs and clients
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        this.embeddingModel = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
        
        this.milvusClient = new MilvusClient({
            address: process.env.MILVUS_URI || 'http://localhost:19530',
            token: process.env.MILVUS_TOKEN
        });
        
        this.gmailEmail = process.env.GMAIL_EMAIL;
        this.gmailPassword = process.env.GMAIL_APP_PASSWORD;
        this.companyEmail = process.env.COMPANY_EMAIL || 'gururaj.m2004@gmail.com';
        
        // Collections for vector storage
        this.policyCollection = 'insurance_policies';
        this.claimCollection = 'insurance_claims';
        this.conversationCollection = 'claim_conversations';
        
        // Embedding dimension for Gemini text-embedding-004
        this.embeddingDimension = 768;
        
        this.validateGmailCredentials();
    }

    validateGmailCredentials() {
        if (!this.gmailEmail || !this.gmailPassword) {
            throw new Error('Gmail email and app password are required in .env file');
        }
        console.log('✓ Gmail credentials loaded successfully');
    }

    async initializeMilvus() {
        try {
            await this.createCollectionIfNotExists(this.policyCollection, [
                { name: 'id', type: 'VarChar', max_length: 100, is_primary: true },
                { name: 'email', type: 'VarChar', max_length: 255 },
                { name: 'company_name', type: 'VarChar', max_length: 255 },
                { name: 'policy_name', type: 'VarChar', max_length: 255 },
                { name: 'purchase_year', type: 'Int64' },
                { name: 'pricing_embedding', type: 'FloatVector', dim: this.embeddingDimension },
                { name: 'covered_conditions_embedding', type: 'FloatVector', dim: this.embeddingDimension },
                { name: 'excluded_conditions_embedding', type: 'FloatVector', dim: this.embeddingDimension },
                { name: 'network_hospitals_embedding', type: 'FloatVector', dim: this.embeddingDimension },
                { name: 'policy_text', type: 'VarChar', max_length: 65535 }
            ]);

            await this.createCollectionIfNotExists(this.claimCollection, [
                { name: 'id', type: 'VarChar', max_length: 100, is_primary: true },
                { name: 'email', type: 'VarChar', max_length: 255 },
                { name: 'document_embedding', type: 'FloatVector', dim: this.embeddingDimension },
                { name: 'document_text', type: 'VarChar', max_length: 65535 },
                { name: 'timestamp', type: 'Int64' }
            ]);

            await this.createCollectionIfNotExists(this.conversationCollection, [
                { name: 'id', type: 'VarChar', max_length: 100, is_primary: true },
                { name: 'email', type: 'VarChar', max_length: 255 },
                { name: 'conversation_embedding', type: 'FloatVector', dim: this.embeddingDimension },
                { name: 'conversation_text', type: 'VarChar', max_length: 65535 },
                { name: 'timestamp', type: 'Int64' }
            ]);

            console.log('✓ Milvus collections initialized successfully');
        } catch (error) {
            console.error('Milvus initialization failed:', error.message);
            throw new Error('Vector database setup failed');
        }
    }

    async createCollectionIfNotExists(collectionName, fields) {
        try {
            const hasCollection = await this.milvusClient.hasCollection({
                collection_name: collectionName
            });

            if (!hasCollection.value) {
                await this.milvusClient.createCollection({
                    collection_name: collectionName,
                    fields: fields,
                    index_params: {
                        field_name: fields.find(f => f.type === 'FloatVector')?.name,
                        index_type: 'IVF_FLAT',
                        metric_type: 'COSINE',
                        params: { nlist: 100 }
                    }
                });
                console.log(`Created collection: ${collectionName}`);
            }
        } catch (error) {
            console.error(`Failed to create collection ${collectionName}:`, error);
            throw error;
        }
    }

    async generateEmbedding(text) {
        try {
            const result = await this.embeddingModel.embedContent(text);
            return result.embedding.values;
        } catch (error) {
            console.error('Embedding generation failed:', error.message);
            throw error;
        }
    }

    async searchPolicyDocuments(companyName, policyName, purchaseYear) {
        try {
            console.log(`🔍 Searching for ${companyName} ${policyName} policy documents...`);
            
            const tavilyResponse = await axios.post('https://api.tavily.com/search', {
                api_key: process.env.TAVILY_API_KEY,
                query: `${companyName} insurance ${policyName} policy document terms conditions coverage`,
                search_depth: 'advanced',
                include_answer: true,
                include_raw_content: true,
                max_results: 3
            });

            const searchResults = tavilyResponse.data.results;
            let policyDocument = '';
            
            for (const result of searchResults) {
                if (result.raw_content && result.raw_content.length > 1000) {
                    policyDocument += result.raw_content + '\n\n';
                }
            }

            if (!policyDocument) {
                policyDocument = tavilyResponse.data.answer || 'No detailed policy document found';
            }

            return policyDocument;
        } catch (error) {
            console.error('Policy document search failed:', error.message);
            return `Generic insurance policy for ${companyName} ${policyName}. Standard coverage includes hospitalization, emergency treatment, and prescribed medications. Exclusions typically include pre-existing conditions, cosmetic procedures, and experimental treatments.`;
        }
    }

    async processPolicyDocument(policyText, email, companyName, policyName, purchaseYear) {
        try {
            console.log('📄 Processing policy document...');
            
            // Extract different sections using Gemini
            const sectionsPrompt = `
            Analyze the following insurance policy document and extract the following sections:

            1. PRICING AND COVERAGE AMOUNTS: Extract all information about premium amounts, coverage limits, deductibles, co-pays, and financial terms.

            2. COVERED CONDITIONS AND PROCEDURES: List all medical conditions, treatments, procedures, and services that are covered under this policy.

            3. EXCLUDED CONDITIONS AND PROCEDURES: List all medical conditions, treatments, procedures, and services that are NOT covered or explicitly excluded.

            4. NETWORK HOSPITALS: Extract information about network hospitals, preferred providers, and healthcare facilities.

            Policy Document:
            ${policyText}

            Please provide detailed extractions for each section:
            `;

            const sectionsResult = await this.model.generateContent(sectionsPrompt);
            const sections = sectionsResult.response.text();
            
            // Split sections
            const sectionParts = sections.split(/\d\.\s+[A-Z\s]+:/);
            
            const pricingText = sectionParts[1] || 'Standard pricing and coverage terms apply.';
            const coveredText = sectionParts[2] || 'Standard medical procedures and treatments covered.';
            const excludedText = sectionParts[3] || 'Pre-existing conditions and cosmetic procedures excluded.';
            const hospitalsText = sectionParts[4] || 'Network hospitals as per company directory.';

            // Generate embeddings for each section
            const [pricingEmb, coveredEmb, excludedEmb, hospitalsEmb] = await Promise.all([
                this.generateEmbedding(pricingText),
                this.generateEmbedding(coveredText),
                this.generateEmbedding(excludedText),
                this.generateEmbedding(hospitalsText)
            ]);

            // Store in Milvus
            const policyData = [{
                id: `policy_${email}_${Date.now()}`,
                email: email,
                company_name: companyName,
                policy_name: policyName,
                purchase_year: purchaseYear,
                pricing_embedding: pricingEmb,
                covered_conditions_embedding: coveredEmb,
                excluded_conditions_embedding: excludedEmb,
                network_hospitals_embedding: hospitalsEmb,
                policy_text: policyText.substring(0, 65000) // Limit text size
            }];

            await this.milvusClient.insert({
                collection_name: this.policyCollection,
                data: policyData
            });

            console.log('✓ Policy document processed and stored');
            return { pricingText, coveredText, excludedText, hospitalsText };
        } catch (error) {
            console.error('Policy processing failed:', error.message);
            throw error;
        }
    }

    async findEmailDocuments(userEmail) {
        try {
            console.log(`📧 Searching for documents from ${userEmail}...`);
            
            return new Promise((resolve, reject) => {
                const imap = new Imap({
                    user: this.gmailEmail,
                    password: this.gmailPassword,
                    host: 'imap.gmail.com',
                    port: 993,
                    tls: true
                });

                let documentText = '';

                imap.once('ready', () => {
                    imap.openBox('INBOX', false, (err, box) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        // Search for emails from the user with attachments
                        imap.search([
                            ['FROM', userEmail],
                            ['SINCE', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] // Last 30 days
                        ], (err, results) => {
                            if (err || !results || results.length === 0) {
                                console.log('No emails found from user');
                                imap.end();
                                resolve(null);
                                return;
                            }

                            // Get the most recent email
                            const fetch = imap.fetch(results.slice(-1), {
                                bodies: '',
                                struct: true
                            });

                            fetch.on('message', (msg, seqno) => {
                                msg.on('body', (stream, info) => {
                                    let buffer = '';
                                    stream.on('data', chunk => buffer += chunk.toString('utf8'));
                                    stream.once('end', async () => {
                                        try {
                                            const parsed = await simpleParser(buffer);
                                            
                                            // Add email body text
                                            if (parsed.text) {
                                                documentText += parsed.text + '\n\n';
                                            }

                                            // Process attachments
                                            if (parsed.attachments) {
                                                for (const attachment of parsed.attachments) {
                                                    const filename = attachment.filename.toLowerCase();
                                                    
                                                    if (filename.endsWith('.pdf')) {
                                                        const pdfData = await pdfParse(attachment.content);
                                                        documentText += pdfData.text + '\n\n';
                                                    } else if (filename.endsWith('.docx')) {
                                                        const docData = await mammoth.extractRawText({ buffer: attachment.content });
                                                        documentText += docData.value + '\n\n';
                                                    } else if (filename.endsWith('.txt')) {
                                                        documentText += attachment.content.toString() + '\n\n';
                                                    }
                                                }
                                            }
                                        } catch (parseError) {
                                            console.error('Error parsing email:', parseError);
                                        }
                                    });
                                });
                            });

                            fetch.once('end', () => {
                                imap.end();
                                resolve(documentText || null);
                            });
                        });
                    });
                });

                imap.once('error', (err) => {
                    reject(err);
                });

                imap.connect();
            });
        } catch (error) {
            console.error('Email document search failed:', error.message);
            return null;
        }
    }

    async processClaimDocument(documentText, email) {
        try {
            console.log('📋 Processing claim document...');
            
            const embedding = await this.generateEmbedding(documentText);
            
            const claimData = [{
                id: `claim_${email}_${Date.now()}`,
                email: email,
                document_embedding: embedding,
                document_text: documentText.substring(0, 65000),
                timestamp: Date.now()
            }];

            await this.milvusClient.insert({
                collection_name: this.claimCollection,
                data: claimData
            });

            console.log('✓ Claim document processed and stored');
            return embedding;
        } catch (error) {
            console.error('Claim document processing failed:', error.message);
            throw error;
        }
    }

    async processConversationData(conversationText, email) {
        try {
            console.log('💬 Processing conversation data...');
            
            const embedding = await this.generateEmbedding(conversationText);
            
            const conversationData = [{
                id: `conversation_${email}_${Date.now()}`,
                email: email,
                conversation_embedding: embedding,
                conversation_text: conversationText.substring(0, 65000),
                timestamp: Date.now()
            }];

            await this.milvusClient.insert({
                collection_name: this.conversationCollection,
                data: conversationData
            });

            console.log('✓ Conversation data processed and stored');
            return embedding;
        } catch (error) {
            console.error('Conversation processing failed:', error.message);
            throw error;
        }
    }

    async calculateClaimScore(userEmail) {
        try {
            console.log('🔍 Analyzing claim against policy...');
            
            // Retrieve user's policy data
            const policySearch = await this.milvusClient.search({
                collection_name: this.policyCollection,
                vectors: [Array(this.embeddingDimension).fill(0)], // Dummy vector for filter-only search
                search_params: { nprobe: 10 },
                limit: 10,
                filter: `email == "${userEmail}"`
            });

            if (!policySearch[0] || policySearch[0].length === 0) {
                return { score: 0, reason: 'No policy found for this email' };
            }

            // Retrieve claim and conversation data
            const claimSearch = await this.milvusClient.search({
                collection_name: this.claimCollection,
                vectors: [Array(this.embeddingDimension).fill(0)],
                search_params: { nprobe: 10 },
                limit: 5,
                filter: `email == "${userEmail}"`
            });

            const conversationSearch = await this.milvusClient.search({
                collection_name: this.conversationCollection,
                vectors: [Array(this.embeddingDimension).fill(0)],
                search_params: { nprobe: 10 },
                limit: 5,
                filter: `email == "${userEmail}"`
            });

            if (!claimSearch[0] || claimSearch[0].length === 0) {
                return { score: 0, reason: 'No claim documents found' };
            }

            // Use Gemini to analyze claim validity
            const policyData = policySearch[0][0];
            const claimData = claimSearch[0][0];
            const conversationData = conversationSearch[0] && conversationSearch[0].length > 0 ? conversationSearch[0][0] : null;

            const analysisPrompt = `
            You are an expert insurance claim analyst. Analyze the following claim against the policy terms and provide a score.

            POLICY INFORMATION:
            Company: ${policyData.company_name}
            Policy: ${policyData.policy_name}
            Purchase Year: ${policyData.purchase_year}
            Policy Text: ${policyData.policy_text}

            CLAIM DOCUMENT:
            ${claimData.document_text}

            ${conversationData ? `CONVERSATION DETAILS:\n${conversationData.conversation_text}` : ''}

            Based on this information, provide:
            1. A score (0 = reject, 0.5 = needs human review, 1 = approve)
            2. A detailed reason for the score

            Consider:
            - Is the condition/procedure covered?
            - Is the hospital in network?
            - Are all required documents present?
            - Is there any evidence of fraud?
            - Do the medical details align with policy terms?

            Format your response as JSON:
            {
                "score": 0 | 0.5 | 1,
                "reason": "detailed explanation",
                "coverage_analysis": "analysis of coverage",
                "risk_assessment": "assessment of risks"
            }
            `;

            const analysisResult = await this.model.generateContent(analysisPrompt);
            const analysisText = analysisResult.response.text();
            
            // Extract JSON from response (remove any markdown formatting)
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            const analysis = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText);
            
            console.log(`📊 Claim Score: ${analysis.score}`);
            console.log(`📝 Reason: ${analysis.reason}`);

            return analysis;
        } catch (error) {
            console.error('Claim scoring failed:', error.message);
            return { score: 0, reason: 'Analysis failed due to technical error' };
        }
    }

    async sendEmail(to, subject, htmlContent, includeButtons = false) {
        try {
            const transporter = nodemailer.createTransporter({
                service: 'gmail',
                auth: {
                    user: this.gmailEmail,
                    pass: this.gmailPassword
                }
            });

            let emailBody = htmlContent;
            
            if (includeButtons) {
                emailBody += `
                <br><br>
                <div style="margin-top: 20px;">
                    <a href="mailto:${this.companyEmail}?subject=APPROVE%20Claim&body=I%20approve%20this%20claim" 
                       style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; margin-right: 10px; border-radius: 5px;">
                        ✅ APPROVE
                    </a>
                    <a href="mailto:${this.companyEmail}?subject=DECLINE%20Claim&body=I%20decline%20this%20claim" 
                       style="background-color: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                        ❌ DECLINE
                    </a>
                </div>
                `;
            }

            const mailOptions = {
                from: this.gmailEmail,
                to: to,
                subject: subject,
                html: emailBody
            };

            await transporter.sendMail(mailOptions);
            console.log(`✓ Email sent to ${to}`);
        } catch (error) {
            console.error('Email sending failed:', error.message);
            throw error;
        }
    }

    async humanInTheLoopApproval(claimAnalysis, userEmail) {
        console.log('\n🤖 HUMAN-IN-THE-LOOP CLARIFICATION REQUIRED');
        console.log('============================================');
        console.log(`Email: ${userEmail}`);
        console.log(`Score: ${claimAnalysis.score}`);
        console.log(`Reason: ${claimAnalysis.reason}`);
        console.log(`Coverage Analysis: ${claimAnalysis.coverage_analysis}`);
        console.log(`Risk Assessment: ${claimAnalysis.risk_assessment}`);
        console.log('============================================');

        const approval = readline.question('\nDo you approve this claim? (y/N): ');
        
        return approval.toLowerCase() === 'y' || approval.toLowerCase() === 'yes';
    }

    async runInsuranceAgent() {
        try {
            console.log('🏥 GR Insurance Claim Support Agent');
            console.log('=====================================\n');
            
            await this.initializeMilvus();

            // Simulate conversation data collection
            console.log('Starting claim processing workflow...\n');
            
            // Get user information
            const userEmail = readline.question('Please provide your email address: ');
            const companyName = readline.question('Which insurance company issued your policy? ');
            const policyName = readline.question('What is the name/type of your insurance policy? ');
            const purchaseYear = parseInt(readline.question('In which year did you purchase this policy? '));
            const claimReason = readline.question('Please describe the reason for your claim: ');

            // Check for suicidal/excluded conditions
            const excludedConditionsPrompt = `Analyze if the following claim reason indicates any commonly excluded insurance conditions (suicide, self-harm, cosmetic procedures, experimental treatments, etc.): "${claimReason}". Respond with YES if excluded, NO if likely covered.`;
            
            const excludedConditionsResult = await this.model.generateContent(excludedConditionsPrompt);
            const excludedConditionsResponse = excludedConditionsResult.response.text();

            const isExcluded = excludedConditionsResponse.trim().toUpperCase().includes('YES');
            
            if (isExcluded) {
                console.log('\n❌ This claim appears to involve excluded conditions.');
                console.log('Your claim cannot be processed under standard policy terms.');
                return;
            }

            // Store conversation data
            const conversationText = `
            Email: ${userEmail}
            Company: ${companyName}
            Policy: ${policyName}
            Purchase Year: ${purchaseYear}
            Claim Reason: ${claimReason}
            `;
            
            await this.processConversationData(conversationText, userEmail);

            // Search for email documents
            console.log('\n📧 Checking for submitted documents...');
            const documentText = await this.findEmailDocuments(userEmail);
            
            if (!documentText) {
                console.log(`\n📧 No documents found in email from ${userEmail}.`);
                console.log('Please send your hospital bills and medical reports to this email and call again.');
                return;
            }

            console.log('✓ Documents found and retrieved from email');

            // Process claim document
            await this.processClaimDocument(documentText, userEmail);

            // Search and process policy documents
            console.log('\n🔍 Searching for policy documentation...');
            const policyDocument = await this.searchPolicyDocuments(companyName, policyName, purchaseYear);
            await this.processPolicyDocument(policyDocument, userEmail, companyName, policyName, purchaseYear);

            console.log('\n📊 Analyzing your claim against policy terms...');
            console.log('This may take a moment...');

            // Calculate claim score
            const claimAnalysis = await this.calculateClaimScore(userEmail);

            console.log('\n✓ Analysis complete');
            console.log('Your details are being verified and all policy documentations have been checked.');
            console.log('You will shortly receive an email regarding the status of your insurance claim process.');
            console.log('Thank you for contacting GR Insurance!');

            // Handle different scores
            if (claimAnalysis.score === 0) {
                // Rejection
                await this.sendEmail(
                    userEmail,
                    'Insurance Claim - Declined',
                    `
                    <h3>Insurance Claim Status: DECLINED</h3>
                    <p>Dear Valued Customer,</p>
                    <p>After careful review of your claim, we regret to inform you that it has been declined for the following reason:</p>
                    <p><strong>${claimAnalysis.reason}</strong></p>
                    <p>If you believe this decision is incorrect, please contact our customer service team with additional documentation.</p>
                    <p>Best regards,<br>GR Insurance Team</p>
                    `
                );
            } else if (claimAnalysis.score === 0.5 || claimAnalysis.score === 1) {
                // Send to human reviewer
                await this.sendEmail(
                    this.companyEmail,
                    `Insurance Claim Review Required - ${userEmail}`,
                    `
                    <h3>Claim Review Required</h3>
                    <p><strong>Customer:</strong> ${userEmail}</p>
                    <p><strong>Policy:</strong> ${companyName} - ${policyName}</p>
                    <p><strong>Score:</strong> ${claimAnalysis.score}</p>
                    <p><strong>Reason:</strong> ${claimAnalysis.reason}</p>
                    <p><strong>Coverage Analysis:</strong> ${claimAnalysis.coverage_analysis}</p>
                    <p><strong>Risk Assessment:</strong> ${claimAnalysis.risk_assessment}</p>
                    <p><strong>Claim Details:</strong> ${claimReason}</p>
                    `,
                    true
                );

                // Human in the loop approval
                const humanApproval = await this.humanInTheLoopApproval(claimAnalysis, userEmail);
                
                if (humanApproval) {
                    await this.sendEmail(
                        userEmail,
                        'Insurance Claim - Approved',
                        `
                        <h3>Insurance Claim Status: APPROVED</h3>
                        <p>Dear Valued Customer,</p>
                        <p>Great news! Your insurance claim has been approved.</p>
                        <p><strong>Reason:</strong> ${claimAnalysis.reason}</p>
                        <p>The claim amount will be processed and transferred to your account within 3-5 business days.</p>
                        <p>Thank you for choosing GR Insurance!</p>
                        <p>Best regards,<br>GR Insurance Team</p>
                        `
                    );
                } else {
                    await this.sendEmail(
                        userEmail,
                        'Insurance Claim - Declined',
                        `
                        <h3>Insurance Claim Status: DECLINED</h3>
                        <p>Dear Valued Customer,</p>
                        <p>After human review, your claim has been declined.</p>
                        <p>If you have additional documentation or questions, please contact our customer service team.</p>
                        <p>Best regards,<br>GR Insurance Team</p>
                        `
                    );
                }
            }

            console.log('\n✅ Insurance claim processing completed successfully!');
            
        } catch (error) {
            console.error('❌ Insurance agent failed:', error.message);
            console.error('Stack trace:', error.stack);
        }
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const helpText = `
Usage: node insurance-agent.js [options]

Options:
  --help          Show this help message
  --test-email    Simulate with a test email
  --email <email> Process claim for specific email

Environment variables required:
  - PORTIA_API_KEY
  - OPENAI_API_KEY
  - GMAIL_CLIENT_ID
  - GMAIL_CLIENT_SECRET
  - GMAIL_REFRESH_TOKEN
  - TAVILY_API_KEY
  - MILVUS_URI (optional, defaults to localhost:19530)
  - COMPANY_EMAIL (optional, defaults to gururaj.m2004@gmail.com)
`;

    if (args.includes('--help')) {
        console.log(helpText);
        return;
    }

    try {
        const agent = new InsuranceClaimAgent();
        await agent.runInsuranceAgent();
    } catch (error) {
        console.error('Failed to start insurance agent:', error.message);
        console.log('\nPlease ensure all required environment variables are set.');
        console.log('See .env.example for required configuration.');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = InsuranceClaimAgent;
