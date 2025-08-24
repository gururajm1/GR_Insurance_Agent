#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline-sync');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

require('dotenv').config();

// ============================================================================
// PORTIA MCP SIMULATION ARCHITECTURE
// ============================================================================

class PortiaMCPConfig {
    constructor() {
        this.portiaApiKey = process.env.PORTIA_API_KEY;
        this.geminiApiKey = process.env.GEMINI_API_KEY;
        this.tavilyApiKey = process.env.TAVILY_API_KEY;
        this.companyEmail = process.env.COMPANY_EMAIL || 'gururaj.m2004@gmail.com';
    }

    static fromDefault() {
        return new PortiaMCPConfig();
    }
}

class ToolHardError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ToolHardError';
    }
}

// ============================================================================
// INSURANCE CLAIM REVIEWER TOOL (like RefundReviewerTool)
// ============================================================================

class ClaimReviewerTool {
    constructor() {
        this.id = "insurance_claim_reviewer";
        this.name = "Insurance Claim Reviewer";
        this.description = "Reviews insurance claims against policy terms and decides approval status";
        
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    }

    async run(claimRequest, policyDocument) {
        try {
            console.log('🔍 Analyzing claim with Insurance Claim Reviewer Tool...');
            
            const prompt = `
            You are an expert insurance claim analyst. Review this claim against the policy.

            CLAIM REQUEST: ${claimRequest}
            POLICY DOCUMENT: ${policyDocument}

            Decide:
            - APPROVED: Clearly covered, process immediately
            - REJECTED: Not covered or excluded condition

            Respond ONLY with JSON:
            {
                "decision": "APPROVED" | "REJECTED",
                "reason": "detailed explanation"
            }
            `;

            const result = await this.model.generateContent(prompt);
            const responseText = result.response.text();
            
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new ToolHardError('Invalid analysis response from AI model');
            }

            const analysis = JSON.parse(jsonMatch[0]);
            
            console.log(`📊 Decision: ${analysis.decision}`);
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
// PORTIA MCP TOOL REGISTRY SIMULATION
// ============================================================================

class DefaultToolRegistry {
    constructor(config) {
        this.config = config;
        this.tools = new Map();
        this.mcpTools = new Map();
        
        // Simulate Portia's automatic MCP tool loading
        this.loadPortiaMCPTools();
    }

    loadPortiaMCPTools() {
        // Simulate Portia's Gmail MCP tools
        this.mcpTools.set("portia:mcp:gmail:read_emails", {
            id: "portia:mcp:gmail:read_emails",
            description: "Read emails from Gmail inbox",
            run: this.simulateGmailRead.bind(this)
        });

        this.mcpTools.set("portia:mcp:gmail:send_email", {
            id: "portia:mcp:gmail:send_email",
            description: "Send emails via Gmail",
            run: this.simulateGmailSend.bind(this)
        });

        console.log('✓ Loaded Portia MCP Gmail tools');
    }

    // Simulate Gmail MCP read (like Portia does)
    async simulateGmailRead(fromEmail) {
        console.log(`📧 [Portia MCP] Reading emails from ${fromEmail}...`);
        
        // Simulate reading email content (mock hospital bill)
        const mockEmailContent = `
        From: ${fromEmail}
        Subject: Insurance Claim Documents
        
        Dear HDFC ERGO,
        
        I am submitting my claim for brain injury treatment.
        
        Attached: Hospital bill and medical reports
        
        Patient: Gururaj's Brother
        Incident Date: January 20, 2024
        Hospital: Apollo Hospitals
        Procedure: Brain injury treatment after accident
        Total Amount: ₹17,350
        
        Please process my claim urgently.
        
        Regards,
        Gururaj M
        `;

        // Simulate attachment processing
        const mockHospitalBill = `
        APOLLO HOSPITALS - HDFC ERGO NETWORK
        Emergency Neurology Department
        
        PATIENT: Gururaj's Brother
        DATE: January 20, 2024
        POLICY: HDFC ERGO Optima Secure
        
        SERVICES:
        Emergency Brain Injury Assessment    ₹3,500
        CT Scan - Head Trauma               ₹2,800  
        MRI - Neurological Analysis         ₹5,200
        ICU Treatment (2 days)              ₹4,500
        Medications                         ₹1,350
        
        TOTAL: ₹17,350
        
        DIAGNOSIS: Traumatic Brain Injury (Accident)
        DOCTOR: Dr. Ramesh Kumar, Neurology
        INSURANCE CLAIM: Pre-approved
        `;

        return {
            emailContent: mockEmailContent,
            attachments: [{
                filename: 'hospital_bill.pdf',
                content: mockHospitalBill
            }]
        };
    }

    // Simulate Gmail MCP send (like Portia does)
    async simulateGmailSend(to, subject, content) {
        console.log(`📧 [Portia MCP] Sending email to ${to}...`);
        
        try {
            // Simulate sending via Portia's Gmail MCP
            await this.callPortiaAPI('gmail/send', {
                to: to,
                subject: subject,
                html: content
            });
            
            console.log(`✅ Email sent successfully via Portia MCP to ${to}`);
            return { messageId: `portia-mcp-${Date.now()}`, status: 'sent' };
        } catch (error) {
            console.log(`⚠️ [Portia MCP Simulation] Email to ${to}`);
            console.log(`Subject: ${subject}`);
            console.log('Content preview:', content.substring(0, 100) + '...');
            return { status: 'simulated', error: error.message };
        }
    }

    // Simulate Portia API calls
    async callPortiaAPI(endpoint, data) {
        if (!this.config.portiaApiKey) {
            throw new Error('Portia API simulation - no actual API call made');
        }

        // This would be the actual Portia API call
        // For now, we simulate it
        console.log(`🔗 [Portia API] Calling ${endpoint}`);
        
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return { success: true, data: data };
    }

    addLocalTool(tool) {
        this.tools.set(tool.id, tool);
        return this;
    }

    getTool(toolId) {
        return this.tools.get(toolId) || this.mcpTools.get(toolId);
    }

    hasTool(toolId) {
        return this.tools.has(toolId) || this.mcpTools.has(toolId);
    }
}

// ============================================================================
// EXECUTION HOOKS (like Portia's CLIExecutionHooks)
// ============================================================================

class CLIExecutionHooks {
    constructor(options = {}) {
        this.beforeToolCallMap = new Map();
        if (options.beforeToolCall && typeof options.beforeToolCall === 'function') {
            // If provided a single handler (legacy), attach to wildcard
            this.beforeToolCallMap.set('*', [options.beforeToolCall]);
        }
        this.afterStepMap = new Map();
    }

    beforeToolCall(toolId, handler) {
        const key = toolId || '*';
        const existing = this.beforeToolCallMap.get(key) || [];
        existing.push(handler);
        this.beforeToolCallMap.set(key, existing);
        return this;
    }

    async callBeforeToolCall(toolId, context, ...args) {
        const handlers = [
            ...(this.beforeToolCallMap.get('*') || []),
            ...(this.beforeToolCallMap.get(toolId) || []),
        ];
        let currentArgs = args;
        for (const handler of handlers) {
            const result = await handler(toolId, context, ...currentArgs);
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
        const existing = this.afterStepMap.get(stepId) || [];
        existing.push(handler);
        this.afterStepMap.set(stepId, existing);
        return this;
    }

    async callAfterStep(stepId, context, output) {
        const handlers = this.afterStepMap.get(stepId) || [];
        for (const handler of handlers) {
            await handler(context, output);
        }
    }
}

function clarifyOnToolCalls(toolId) {
    return async (currentToolId, context, ...args) => {
        if (currentToolId === toolId) {
            console.log('\n🤖 PORTIA EXECUTION PAUSE - HUMAN CLARIFICATION REQUIRED');
            console.log('================================================');
            console.log(`Tool: ${toolId}`);
            console.log('Arguments:', JSON.stringify(args, null, 2));
            console.log('================================================');

            const approval = readline.question('\nApprove this tool execution? (y/N): ');
            
            if (approval.toLowerCase() !== 'y' && approval.toLowerCase() !== 'yes') {
                throw new ToolHardError('Tool execution cancelled by human reviewer');
            }
            
            console.log('✅ Human approved - continuing execution...');
        }
        return true;
    };
}

function injectUserGreetingForGmailSend() {
    return async (currentToolId, context, ...args) => {
        if (currentToolId !== 'portia:mcp:gmail:send_email') return args;
        const to = args[0];
        const subject = args[1];
        const html = args[2] || '';

        const userEmail = context && (context.userEmail || context.customerEmail);
        const userName = (context && (context.userName || context.customerName))
            || (typeof userEmail === 'string' ? userEmail.split('@')[0] : null)
            || (typeof to === 'string' ? to.split('@')[0] : 'Customer');

        // Apply only when emailing the customer
        const isCustomer = typeof to === 'string' && userEmail && to.toLowerCase() === userEmail.toLowerCase();
        if (!isCustomer) return args;

        let updatedHtml = html;
        if (/Dear\s/i.test(updatedHtml)) {
            updatedHtml = updatedHtml.replace(/Dear\s*(Valued\s*Customer|Customer)\s*[,|，]/i, `Dear ${userName},`);
        } else {
            updatedHtml = `<p>Dear ${userName},</p>\n` + updatedHtml;
        }

        return { args: [to, subject, updatedHtml, ...args.slice(3)] };
    };
}

function deriveUserNameFromEmailRead() {
    return async (context, emailData) => {
        if (!context) return;
        if (!context.userEmail && emailData && emailData.emailContent) {
            const match = emailData.emailContent.match(/From:\s*(\S+@\S+)/i);
            if (match) context.userEmail = match[1].toLowerCase();
        }
        if (context.userName) return;
        let possible = null;
        if (emailData && emailData.emailContent) {
            const sig = emailData.emailContent.match(/(?:Regards|Thanks|Thank you|Sincerely|Best)\s*[,:-]?\s*\n\s*([A-Za-z][A-Za-z\s.'-]{1,60})/i);
            if (sig && sig[1]) possible = sig[1].trim();
        }
        if (!possible && context.userEmail) {
            possible = context.userEmail.split('@')[0].replace(/[._\-]+/g, ' ');
        }
        context.userName = possible || context.userName || 'Customer';
    };
}

// ============================================================================
// PORTIA-STYLE MAIN AGENT
// ============================================================================

class PortiaInsuranceAgent {
    constructor() {
        this.config = PortiaMCPConfig.fromDefault();
        
        // Create tool registry with MCP tools (like refund agent)
        this.toolRegistry = new DefaultToolRegistry(this.config);
        this.toolRegistry.addLocalTool(new ClaimReviewerTool());
        
        // Setup execution hooks with human-in-the-loop
        this.executionHooks = new CLIExecutionHooks();
        this.executionHooks
            .afterStep('portia:mcp:gmail:read_emails', deriveUserNameFromEmailRead())
            .beforeToolCall('portia:mcp:gmail:send_email', injectUserGreetingForGmailSend())
            .beforeToolCall('portia:mcp:gmail:send_email', clarifyOnToolCalls("portia:mcp:gmail:send_email"));
        
        console.log('✓ Portia Insurance Agent initialized');
        console.log('✓ MCP Gmail tools loaded');
        console.log('✓ Local claim reviewer tool loaded');
    }

    async plan(query) {
        // Simulate Portia's planning (like refund agent's plan)
        console.log('\n📋 PORTIA PLAN GENERATION');
        console.log('=========================');
        console.log('Query:', query);
        
        const plan = {
            steps: [
                { tool: "portia:mcp:gmail:read_emails", description: "Read customer email with claim documents" },
                { tool: "tavily:search", description: "Search for insurance policy documents online" },
                { tool: "insurance_claim_reviewer", description: "Analyze claim against policy terms" },
                { tool: "portia:mcp:gmail:send_email", description: "Send decision email to customer" }
            ],
            query: query
        };
        
        console.log('\nGenerated Plan:');
        plan.steps.forEach((step, i) => {
            console.log(`${i + 1}. [${step.tool}] ${step.description}`);
        });
        
        return plan;
    }

    async runPlan(plan) {
        console.log('\n🚀 EXECUTING PORTIA PLAN');
        console.log('=========================');
        
        try {
            // Extract customer email from query
            const emailMatch = plan.query.match(/customer_email:\s*(\S+@\S+)/);
            const customerEmail = emailMatch ? emailMatch[1] : 'gururaj.m2004@gmail.com';
            
            const claimMatch = plan.query.match(/claim_reason:\s*(.+?)(?:\s+customer_email:|$)/);
            const claimReason = claimMatch ? claimMatch[1].trim() : 'brain injury from accident';

            // Step 1: Read customer email (MCP Gmail)
            console.log('\n📧 Step 1: Reading customer email...');
            const gmailReadTool = this.toolRegistry.getTool("portia:mcp:gmail:read_emails");
            const emailData = await gmailReadTool.run(customerEmail);
            const hookContext = { userEmail: customerEmail };
            await this.executionHooks.callAfterStep('portia:mcp:gmail:read_emails', hookContext, emailData);
            
            console.log('✓ Email and documents retrieved');

            // Step 2: Search policy documents (Tavily)
            console.log('\n🔍 Step 2: Searching policy documents...');
            const policyDocument = await this.searchPolicyDocument('HDFC ERGO', 'Optima Secure');
            console.log('✓ Policy documents found');

            // Step 3: Analyze claim
            console.log('\n🤖 Step 3: Analyzing claim...');
            const claimReviewerTool = this.toolRegistry.getTool("insurance_claim_reviewer");
            
            try {
                const analysisResult = await claimReviewerTool.run(
                    `Claim: ${claimReason}\nEmail: ${emailData.emailContent}\nDocuments: ${emailData.attachments[0].content}`,
                    policyDocument
                );
                
                const analysis = JSON.parse(analysisResult);
                
                // Step 4: Send approval email (with human-in-the-loop)
                console.log('\n📧 Step 4: Sending decision email...');
                
                const gmailSendTool = this.toolRegistry.getTool("portia:mcp:gmail:send_email");
                const context = hookContext;
                let sendArgs = [
                    customerEmail,
                    'HDFC ERGO Claim - APPROVED ✅',
                    `
                    <h2>🎉 Insurance Claim Approved!</h2>
                    <p>Your brain injury claim has been <strong>APPROVED</strong>.</p>
                    <p><strong>Reason:</strong> ${analysis.reason}</p>
                    <p><strong>Claim Amount:</strong> ₹17,350</p>
                    <p>Processing will begin immediately and funds will be transferred within 5-7 business days.</p>
                    <p>Best regards,<br>HDFC ERGO Claims Team</p>
                    <p><em>Processed via Portia AI Insurance Agent</em></p>
                    `
                ];
                sendArgs = await this.executionHooks.callBeforeToolCall("portia:mcp:gmail:send_email", context, ...sendArgs);
                await gmailSendTool.run(...sendArgs);

            } catch (error) {
                if (error instanceof ToolHardError) {
                    // Send rejection email
                    console.log('\n📧 Sending rejection email...');
                    
                    const gmailSendTool = this.toolRegistry.getTool("portia:mcp:gmail:send_email");
                    const context = hookContext;
                    let rejectArgs = [
                        customerEmail,
                        'HDFC ERGO Claim - Declined ❌',
                        `
                        <h2>Insurance Claim Update</h2>
                        <p>After careful review, your claim has been declined.</p>
                        <p><strong>Reason:</strong> ${error.message}</p>
                        <p>If you have additional documentation, please contact our customer service.</p>
                        <p>Best regards,<br>HDFC ERGO Claims Team</p>
                        `
                    ];
                    rejectArgs = await this.executionHooks.callBeforeToolCall("portia:mcp:gmail:send_email", context, ...rejectArgs);
                    await gmailSendTool.run(...rejectArgs);
                }
            }

            console.log('\n✅ PLAN EXECUTION COMPLETED SUCCESSFULLY');
            console.log('All tools executed via Portia MCP architecture!');

        } catch (error) {
            console.error('❌ Plan execution failed:', error.message);
            throw error;
        }
    }

    async searchPolicyDocument(company, policy) {
        if (this.config.tavilyApiKey) {
            try {
                const response = await axios.post('https://api.tavily.com/search', {
                    api_key: this.config.tavilyApiKey,
                    query: `${company} ${policy} insurance policy coverage brain injury accident`,
                    max_results: 3
                });
                
                return response.data.results.map(r => r.content).join('\n');
            } catch (error) {
                console.log('⚠️ Using mock policy (Tavily search failed)');
            }
        }

        // Mock policy document
        return `
        HDFC ERGO OPTIMA SECURE POLICY
        
        COVERED CONDITIONS:
        ✓ Accidental injuries including brain trauma
        ✓ Emergency neurological procedures
        ✓ ICU/CCU treatment for accidents
        ✓ Rehabilitation therapy
        
        NETWORK HOSPITALS:
        ✓ Apollo Hospitals (All branches)
        ✓ Fortis Healthcare Network
        
        COVERAGE AMOUNT: Up to ₹50,00,000 per year
        CLAIM PROCESSING: Pre-approved for network hospitals
        `;
    }
}

// ============================================================================
// MAIN FUNCTION (like refund agent's main)
// ============================================================================

async function main() {
    try {
        // Get customer details (like refund agent reads from inbox.txt)
        console.log('🏥 PORTIA MCP INSURANCE AGENT');
        console.log('==============================\n');
        
        const customerEmail = readline.question('Customer email: ') || 'gururaj.m2004@gmail.com';
        const claimReason = readline.question('Claim reason: ') || 'brain injury from accident';

        // Create Portia agent
        const agent = new PortiaInsuranceAgent();
        
        // Generate plan (like refund agent)
        const query = `Process insurance claim for customer. claim_reason: ${claimReason} customer_email: ${customerEmail}`;
        const plan = await agent.plan(query);
        
        // Execute plan (like refund agent)
        await agent.runPlan(plan);
        
    } catch (error) {
        console.error('❌ Portia Insurance Agent failed:', error.message);
        
        if (error instanceof ToolHardError) {
            console.log('Tool execution was halted by human reviewer or tool error.');
        }
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = PortiaInsuranceAgent;
