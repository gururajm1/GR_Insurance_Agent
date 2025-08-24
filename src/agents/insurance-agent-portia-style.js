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

require('dotenv').config();

// ============================================================================
// PORTIA-STYLE ARCHITECTURE IMPLEMENTATION
// ============================================================================

class ToolHardError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ToolHardError';
    }
}

class ToolRunContext {
    constructor(data = {}) {
        this.data = data;
    }
}

class BaseTool {
    constructor() {
        this.id = '';
        this.name = '';
        this.description = '';
    }

    async run(context, ...args) {
        throw new Error('Tool run method must be implemented');
    }
}

// ============================================================================
// INSURANCE CLAIM REVIEWER TOOL (Like RefundReviewerTool)
// ============================================================================

class ClaimReviewerTool extends BaseTool {
    constructor(geminiModel) {
        super();
        this.id = "claim_reviewer";
        this.name = "Insurance Claim Reviewer";
        this.description = "A tool to review an insurance claim against the policy terms and decide if it gets approved, needs review, or rejected. This tool does not actually process the claim.";
        this.model = geminiModel;
    }

    async run(context, claimRequest, policyDocument, userDocuments) {
        try {
            console.log('🔍 Analyzing claim against policy...');
            
            const analysisPrompt = `
            You are an expert insurance claim analyst. Analyze the following claim against the policy terms.

            POLICY DOCUMENT:
            ${policyDocument}

            CLAIM REQUEST:
            ${claimRequest}

            USER MEDICAL DOCUMENTS:
            ${userDocuments}

            Based on this information, decide:
            1. APPROVED (score: 1) - Clear coverage, all conditions met
            2. NEEDS_REVIEW (score: 0.5) - Covered but requires human verification  
            3. REJECTED (score: 0) - Not covered or excluded condition

            Consider:
            - Is the condition/procedure covered?
            - Are all required documents present?
            - Is there any evidence of fraud?
            - Do the medical details align with policy terms?

            Respond with ONLY a JSON object:
            {
                "decision": "APPROVED" | "NEEDS_REVIEW" | "REJECTED",
                "score": 1 | 0.5 | 0,
                "reason": "detailed explanation",
                "coverage_analysis": "analysis of coverage",
                "risk_assessment": "assessment of risks"
            }
            `;

            const result = await this.model.generateContent(analysisPrompt);
            const responseText = result.response.text();
            
            // Extract JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new ToolHardError('Failed to get valid analysis from AI model');
            }

            const analysis = JSON.parse(jsonMatch[0]);
            
            console.log(`📊 Decision: ${analysis.decision}`);
            console.log(`📊 Score: ${analysis.score}`);
            console.log(`📝 Reason: ${analysis.reason}`);

            if (analysis.decision === "REJECTED") {
                throw new ToolHardError(`Claim rejected: ${analysis.reason}`);
            }

            return JSON.stringify(analysis);
        } catch (error) {
            if (error instanceof ToolHardError) {
                throw error;
            }
            throw new ToolHardError(`Claim analysis failed: ${error.message}`);
        }
    }
}

// ============================================================================
// EMAIL DOCUMENT RETRIEVER TOOL
// ============================================================================

class EmailDocumentTool extends BaseTool {
    constructor(gmailEmail, gmailPassword) {
        super();
        this.id = "email_document_retriever";
        this.name = "Email Document Retriever";
        this.description = "Retrieves documents from user emails";
        this.gmailEmail = gmailEmail;
        this.gmailPassword = gmailPassword;
    }

    async run(context, userEmail) {
        console.log(`📧 Searching for documents from ${userEmail}...`);
        
        return new Promise((resolve, reject) => {
            const imap = new Imap({
                user: this.gmailEmail,
                password: this.gmailPassword,
                host: 'imap.gmail.com',
                port: 993,
                tls: true,
                tlsOptions: {
                    rejectUnauthorized: false,
                    servername: 'imap.gmail.com'
                }
            });

            let documentText = '';

            imap.once('ready', () => {
                imap.openBox('INBOX', false, (err, box) => {
                    if (err) {
                        reject(new ToolHardError(`Email access failed: ${err.message}`));
                        return;
                    }

                    imap.search([
                        ['FROM', userEmail],
                        ['SINCE', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)]
                    ], (err, results) => {
                        if (err || !results || results.length === 0) {
                            reject(new ToolHardError(`No emails found from ${userEmail}. Please send your documents and try again.`));
                            return;
                        }

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
                                        
                                        if (parsed.text) {
                                            documentText += parsed.text + '\n\n';
                                        }

                                        if (parsed.attachments) {
                                            for (const attachment of parsed.attachments) {
                                                const filename = attachment.filename.toLowerCase();
                                                
                                                if (filename.endsWith('.pdf')) {
                                                    const pdfData = await pdfParse(attachment.content);
                                                    documentText += pdfData.text + '\n\n';
                                                } else if (filename.endsWith('.docx')) {
                                                    const docData = await mammoth.extractRawText({ buffer: attachment.content });
                                                    documentText += docData.value + '\n\n';
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
                            if (!documentText) {
                                reject(new ToolHardError('No documents found in email'));
                            } else {
                                console.log('✓ Documents found and retrieved from email');
                                resolve(documentText);
                            }
                        });
                    });
                });
            });

            imap.once('error', (err) => {
                reject(new ToolHardError(`Email connection failed: ${err.message}`));
            });

            imap.connect();
        });
    }
}

// ============================================================================
// POLICY SEARCH TOOL
// ============================================================================

class PolicySearchTool extends BaseTool {
    constructor(tavilyApiKey) {
        super();
        this.id = "policy_search";
        this.name = "Insurance Policy Search";
        this.description = "Searches for insurance policy documents online";
        this.tavilyApiKey = tavilyApiKey;
    }

    async run(context, companyName, policyName, purchaseYear) {
        try {
            console.log(`🔍 Searching for ${companyName} ${policyName} policy documents...`);
            
            const response = await axios.post('https://api.tavily.com/search', {
                api_key: this.tavilyApiKey,
                query: `${companyName} insurance ${policyName} policy document terms conditions coverage`,
                search_depth: 'advanced',
                include_answer: true,
                include_raw_content: true,
                max_results: 3
            });

            let policyDocument = '';
            
            for (const result of response.data.results) {
                if (result.raw_content && result.raw_content.length > 1000) {
                    policyDocument += result.raw_content + '\n\n';
                }
            }

            if (!policyDocument) {
                policyDocument = response.data.answer || `Standard ${companyName} ${policyName} policy. Coverage includes hospitalization, emergency treatment, prescribed medications. Standard exclusions apply for pre-existing conditions and cosmetic procedures.`;
            }

            console.log('✓ Policy documents retrieved from web search');
            return policyDocument;
        } catch (error) {
            throw new ToolHardError(`Policy search failed: ${error.message}`);
        }
    }
}

// ============================================================================
// EMAIL NOTIFICATION TOOL
// ============================================================================

class EmailNotificationTool extends BaseTool {
    constructor(gmailEmail, gmailPassword, companyEmail) {
        super();
        this.id = "email_notification";
        this.name = "Email Notification Sender";
        this.description = "Sends email notifications to customers and admins";
        this.gmailEmail = gmailEmail;
        this.gmailPassword = gmailPassword;
        this.companyEmail = companyEmail;
    }

    async run(context, recipientEmail, subject, htmlContent, includeButtons = false) {
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
                to: recipientEmail,
                subject: subject,
                html: emailBody
            };

            await transporter.sendMail(mailOptions);
            console.log(`✓ Email sent to ${recipientEmail}`);
            return `Email sent successfully to ${recipientEmail}`;
        } catch (error) {
            throw new ToolHardError(`Email sending failed: ${error.message}`);
        }
    }
}

// ============================================================================
// TOOL REGISTRY (Like Portia's ToolRegistry)
// ============================================================================

class ToolRegistry {
    constructor() {
        this.tools = new Map();
    }

    addTool(tool) {
        this.tools.set(tool.id, tool);
        return this;
    }

    getTool(toolId) {
        return this.tools.get(toolId);
    }

    getAllTools() {
        return Array.from(this.tools.values());
    }
}

// ============================================================================
// EXECUTION HOOKS (Like Portia's ExecutionHooks)
// ============================================================================

class ExecutionHooks {
    constructor() {
        this.beforeToolCallHandlers = new Map();
        this.afterStepHandlers = new Map();
    }

    beforeToolCall(toolId, handler) {
        const existing = this.beforeToolCallHandlers.get(toolId) || [];
        existing.push(handler);
        this.beforeToolCallHandlers.set(toolId, existing);
        return this;
    }

    async callBeforeToolCall(toolId, context, ...args) {
        const handlers = this.beforeToolCallHandlers.get(toolId) || [];
        let currentArgs = args;
        for (const handler of handlers) {
            const result = await handler(context, ...currentArgs);
            if (result === false) {
                throw new ToolHardError(`Execution halted by hook for tool ${toolId}`);
            }
            if (Array.isArray(result)) {
                currentArgs = result;
            } else if (result && Array.isArray(result.args)) {
                currentArgs = result.args;
            }
        }
        return currentArgs;
    }

    afterStep(stepId, handler) {
        const existing = this.afterStepHandlers.get(stepId) || [];
        existing.push(handler);
        this.afterStepHandlers.set(stepId, existing);
        return this;
    }

    async callAfterStep(stepId, context, output) {
        const handlers = this.afterStepHandlers.get(stepId) || [];
        for (const handler of handlers) {
            await handler(context, output);
        }
    }
}

// ============================================================================
// HUMAN-IN-THE-LOOP CLARIFICATION (Like Portia's clarify_on_tool_calls)
// ============================================================================

function clarifyOnToolCalls(toolId) {
    return async (context, ...args) => {
        console.log('\n🤖 HUMAN-IN-THE-LOOP CLARIFICATION REQUIRED');
        console.log('============================================');
        console.log(`Tool: ${toolId}`);
        console.log(`Context: ${JSON.stringify(context.data, null, 2)}`);
        console.log('============================================');

        const approval = readline.question('\nProceed with this operation? (y/N): ');
        
        if (approval.toLowerCase() !== 'y' && approval.toLowerCase() !== 'yes') {
            throw new ToolHardError('Operation cancelled by human reviewer');
        }
        
        return true; // Continue execution
    };
}

function injectUserGreeting(toolId) {
    return async (context, ...args) => {
        if (toolId !== "email_notification") return args;
        const recipientEmail = args[0];
        const subject = args[1];
        const htmlContent = args[2] || '';
        const includeButtons = args[3];

        const derivedName = deriveDisplayName(
            context && context.data && (context.data.userName || context.data.userEmail),
            recipientEmail
        );

        let updatedHtml = htmlContent;

        if (/Dear\s/i.test(updatedHtml)) {
            updatedHtml = updatedHtml.replace(/Dear\s*(Valued\s*Customer|Customer)\s*[,|，]/i, `Dear ${derivedName},`);
        } else {
            updatedHtml = `<p>Dear ${derivedName},</p>\n` + updatedHtml;
        }

        return { args: [recipientEmail, subject, updatedHtml, includeButtons] };
    };
}

function deriveDisplayName(primaryIdentifier, fallbackEmail) {
    const candidate = typeof primaryIdentifier === 'string' ? primaryIdentifier : (typeof fallbackEmail === 'string' ? fallbackEmail : 'Customer');
    const emailLocal = candidate.includes('@') ? candidate.split('@')[0] : candidate;
    const cleaned = emailLocal
        .replace(/\d+/g, ' ')
        .replace(/[_\-.]+/g, ' ')
        .trim();
    if (!cleaned) return 'Customer';
    return cleaned.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function deriveUserNameFromDocuments() {
    return async (context, userDocuments) => {
        if (!context || !context.data) return;
        if (context.data.userName) return; // already set

        const text = typeof userDocuments === 'string' ? userDocuments : '';
        let name = null;

        const signatureRegexes = [
            /(?:Regards|Thanks|Thank you|Sincerely|Best|Best regards|Warm regards)\s*[,:-]?\s*\n\s*([A-Za-z][A-Za-z\s.'-]{1,60})/i,
            /\n\s*Name\s*[:：]\s*([A-Za-z][A-Za-z\s.'-]{1,60})/i,
            /\bPatient\s*[:：]\s*([A-Za-z][A-Za-z\s.'-]{1,60})/i
        ];
        for (const rx of signatureRegexes) {
            const m = text.match(rx);
            if (m && m[1]) { name = m[1].trim(); break; }
        }
        if (!name) {
            name = deriveDisplayName(context.data.userEmail || '', context.data.userEmail || '');
        }
        context.data.userName = name;
    };
}

// ============================================================================
// MAIN INSURANCE AGENT (Like Portia's main class)
// ============================================================================

class PortiaStyleInsuranceAgent {
    constructor() {
        // Initialize Gemini
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Gmail credentials
        this.gmailEmail = process.env.GMAIL_EMAIL;
        this.gmailPassword = process.env.GMAIL_APP_PASSWORD;
        this.companyEmail = process.env.COMPANY_EMAIL || 'gururaj.m2004@gmail.com';
        
        // Initialize tool registry
        this.toolRegistry = new ToolRegistry();
        this.setupTools();
        
        // Initialize execution hooks
        this.executionHooks = new ExecutionHooks();
        this.setupExecutionHooks();
        
        this.validateCredentials();
    }

    validateCredentials() {
        if (!this.gmailEmail || !this.gmailPassword) {
            throw new Error('Gmail credentials required in .env file');
        }
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('Gemini API key required in .env file');
        }
        console.log('✓ All credentials validated');
    }

    setupTools() {
        // Add all tools to registry (like Portia's tool setup)
        this.toolRegistry
            .addTool(new ClaimReviewerTool(this.model))
            .addTool(new EmailDocumentTool(this.gmailEmail, this.gmailPassword))
            .addTool(new PolicySearchTool(process.env.TAVILY_API_KEY))
            .addTool(new EmailNotificationTool(this.gmailEmail, this.gmailPassword, this.companyEmail));
    }

    setupExecutionHooks() {
        // Set up human-in-the-loop for critical operations
        this.executionHooks
            .beforeToolCall("email_notification", injectUserGreeting("email_notification"))
            .beforeToolCall("email_notification", clarifyOnToolCalls("email_notification"))
            .afterStep("email_document_retriever", deriveUserNameFromDocuments());
    }

    async executePlan() {
        try {
            console.log('🏥 GR Insurance Claim Support Agent (Portia Architecture)');
            console.log('========================================================\n');
            
            // Collect user information (like reading inbox.txt in refund agent)
            const userEmail = readline.question('Please provide your email address: ');
            const companyName = readline.question('Which insurance company issued your policy? ');
            const policyName = readline.question('What is the name/type of your insurance policy? ');
            const purchaseYear = parseInt(readline.question('In which year did you purchase this policy? '));
            const claimReason = readline.question('Please describe the reason for your claim: ');

            const context = new ToolRunContext({
                userEmail,
                companyName,
                policyName,
                purchaseYear,
                claimReason
            });

            // Execute tools in sequence (like Portia's plan execution)
            console.log('\n📋 Executing insurance claim processing plan...');
            
            // Step 1: Get user documents
            const emailTool = this.toolRegistry.getTool("email_document_retriever");
            const userDocuments = await emailTool.run(context, userEmail);
            await this.executionHooks.callAfterStep("email_document_retriever", context, userDocuments);

            // Step 2: Get policy documents
            const policyTool = this.toolRegistry.getTool("policy_search");
            const policyDocument = await policyTool.run(context, companyName, policyName, purchaseYear);

            // Step 3: Analyze claim (like RefundReviewerTool)
            const claimReviewerTool = this.toolRegistry.getTool("claim_reviewer");
            let analysisResult;
            
            try {
                analysisResult = await claimReviewerTool.run(context, claimReason, policyDocument, userDocuments);
                const analysis = JSON.parse(analysisResult);
                
                console.log('\n✓ Analysis complete');
                console.log('Your details are being verified and all policy documentations have been checked.');
                console.log('You will shortly receive an email regarding the status of your insurance claim process.');
                console.log('Thank you for contacting GR Insurance!');

                // Step 4: Send notifications based on decision
                const emailTool = this.toolRegistry.getTool("email_notification");
                
                if (analysis.decision === "APPROVED") {
                    // Send approval email
                    let sendArgs = [
                        userEmail,
                        'Insurance Claim - Approved',
                        `
                        <h3>Insurance Claim Status: APPROVED</h3>
                        <p>Great news! Your insurance claim has been approved.</p>
                        <p><strong>Reason:</strong> ${analysis.reason}</p>
                        <p>The claim amount will be processed and transferred to your account within 3-5 business days.</p>
                        <p>Thank you for choosing GR Insurance!</p>
                        <p>Best regards,<br>GR Insurance Team</p>
                        `,
                        false
                    ];
                    sendArgs = await this.executionHooks.callBeforeToolCall("email_notification", context, ...sendArgs);
                    await emailTool.run(context, ...sendArgs);
                } else if (analysis.decision === "NEEDS_REVIEW") {
                    // Send to human reviewer with clarification
                    let reviewArgs = [
                        this.companyEmail,
                        `Insurance Claim Review Required - ${userEmail}`,
                        `
                        <h3>Claim Review Required</h3>
                        <p><strong>Customer:</strong> ${userEmail}</p>
                        <p><strong>Policy:</strong> ${companyName} - ${policyName}</p>
                        <p><strong>Score:</strong> ${analysis.score}</p>
                        <p><strong>Reason:</strong> ${analysis.reason}</p>
                        <p><strong>Coverage Analysis:</strong> ${analysis.coverage_analysis}</p>
                        <p><strong>Risk Assessment:</strong> ${analysis.risk_assessment}</p>
                        <p><strong>Claim Details:</strong> ${claimReason}</p>
                        `,
                        true
                    ];
                    reviewArgs = await this.executionHooks.callBeforeToolCall("email_notification", context, ...reviewArgs);
                    await emailTool.run(context, ...reviewArgs);

                    // Human approval decision
                    console.log('\n🤖 HUMAN REVIEW REQUIRED');
                    console.log('========================');
                    console.log(`Email: ${userEmail}`);
                    console.log(`Score: ${analysis.score}`);
                    console.log(`Reason: ${analysis.reason}`);
                    console.log('========================');

                    const humanApproval = readline.question('\nDo you approve this claim? (y/N): ');
                    
                    if (humanApproval.toLowerCase() === 'y' || humanApproval.toLowerCase() === 'yes') {
                        let approvedArgs = [
                            userEmail,
                            'Insurance Claim - Approved',
                            `
                            <h3>Insurance Claim Status: APPROVED</h3>
                            <p>Great news! Your insurance claim has been approved after human review.</p>
                            <p><strong>Reason:</strong> ${analysis.reason}</p>
                            <p>The claim amount will be processed and transferred to your account within 3-5 business days.</p>
                            <p>Thank you for choosing GR Insurance!</p>
                            <p>Best regards,<br>GR Insurance Team</p>
                            `,
                            false
                        ];
                        approvedArgs = await this.executionHooks.callBeforeToolCall("email_notification", context, ...approvedArgs);
                        await emailTool.run(context, ...approvedArgs);
                    } else {
                        let declinedArgs = [
                            userEmail,
                            'Insurance Claim - Declined',
                            `
                            <h3>Insurance Claim Status: DECLINED</h3>
                            <p>After human review, your claim has been declined.</p>
                            <p>If you have additional documentation or questions, please contact our customer service team.</p>
                            <p>Best regards,<br>GR Insurance Team</p>
                            `,
                            false
                        ];
                        declinedArgs = await this.executionHooks.callBeforeToolCall("email_notification", context, ...declinedArgs);
                        await emailTool.run(context, ...declinedArgs);
                    }
                }

            } catch (error) {
                if (error instanceof ToolHardError) {
                    // Handle rejection (like refund agent)
                    console.log('\n❌ Claim rejected');
                    
                    const emailTool = this.toolRegistry.getTool("email_notification");
                    let rejectedArgs = [
                        userEmail,
                        'Insurance Claim - Declined',
                        `
                        <h3>Insurance Claim Status: DECLINED</h3>
                        <p>After careful review, your claim has been declined for the following reason:</p>
                        <p><strong>${error.message}</strong></p>
                        <p>If you believe this decision is incorrect, please contact our customer service team with additional documentation.</p>
                        <p>Best regards,<br>GR Insurance Team</p>
                        `,
                        false
                    ];
                    rejectedArgs = await this.executionHooks.callBeforeToolCall("email_notification", context, ...rejectedArgs);
                    await emailTool.run(context, ...rejectedArgs);
                } else {
                    throw error;
                }
            }

            console.log('\n✅ Insurance claim processing completed successfully!');
            
        } catch (error) {
            console.error('❌ Insurance agent failed:', error.message);
            if (error instanceof ToolHardError) {
                console.error('Tool Error Details:', error.message);
            } else {
                console.error('Stack trace:', error.stack);
            }
        }
    }
}

// ============================================================================
// MAIN EXECUTION (Like refund agent's main function)
// ============================================================================

async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help')) {
        console.log(`
Usage: node insurance-agent-portia-style.js [options]

Options:
  --help          Show this help message
  --email <email> Process claim for specific email (future use)

Environment variables required:
  - GEMINI_API_KEY
  - GMAIL_EMAIL
  - GMAIL_APP_PASSWORD
  - TAVILY_API_KEY (optional)
  - COMPANY_EMAIL (optional)
        `);
        return;
    }

    try {
        const agent = new PortiaStyleInsuranceAgent();
        await agent.executePlan();
    } catch (error) {
        console.error('Failed to start insurance agent:', error.message);
        console.log('\nPlease ensure all required environment variables are set.');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = PortiaStyleInsuranceAgent;
