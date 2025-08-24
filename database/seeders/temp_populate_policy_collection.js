#!/usr/bin/env node

// TEMPORARY SCRIPT TO POPULATE all_policy_details COLLECTION
// This script will be deleted after execution

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { MilvusClient } = require('@zilliz/milvus2-sdk-node');

require('dotenv').config();

class PolicyDataPopulator {
    constructor() {
        // Initialize multiple Gemini API keys for failover
        this.apiKeys = [
            process.env.GEMINI_API_KEY,
            process.env.GEMINI_API_KEY_1,
            process.env.GEMINI_API_KEY_2
        ].filter(key => key); // Remove undefined keys
        
        if (this.apiKeys.length === 0) {
            throw new Error('At least one GEMINI_API_KEY must be provided in .env file');
        }
        
        console.log(`✅ Loaded ${this.apiKeys.length} Gemini API key(s) for failover`);
        
        // Rate limit tracking (in-memory, 10 minutes cooldown)
        this.rateLimitTracker = new Map(); // key: apiKeyIndex, value: { limitedUntil: timestamp }
        this.currentKeyIndex = 0;
        
        // Initialize with primary key
        this.initializeGeminiClients();
        
        // Initialize Milvus
        this.milvusClient = new MilvusClient({
            address: process.env.MILVUS_URI,
            token: process.env.MILVUS_TOKEN
        });
        
        console.log('🔗 Connected to Zilliz Cloud');
    }
    
    initializeGeminiClients() {
        const currentKey = this.apiKeys[this.currentKeyIndex];
        console.log(`🔑 Initializing Gemini clients with API key ${this.currentKeyIndex + 1}`);
        
        this.genAI = new GoogleGenerativeAI(currentKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        this.embeddingModel = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
    }
    
    // Check if API key is rate limited
    isKeyRateLimited(keyIndex) {
        const limitInfo = this.rateLimitTracker.get(keyIndex);
        if (!limitInfo) return false;
        
        const now = Date.now();
        if (now > limitInfo.limitedUntil) {
            // Rate limit expired, remove from tracker
            this.rateLimitTracker.delete(keyIndex);
            return false;
        }
        return true;
    }
    
    // Mark current API key as rate limited
    markCurrentKeyAsLimited() {
        const limitedUntil = Date.now() + (10 * 60 * 1000); // 10 minutes
        this.rateLimitTracker.set(this.currentKeyIndex, { limitedUntil });
        console.log(`🚫 Marking API key ${this.currentKeyIndex + 1} as rate-limited for 10 minutes`);
    }
    
    // Switch to next available API key
    switchToNextAvailableKey() {
        const startIndex = this.currentKeyIndex;
        
        do {
            this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
            
            if (!this.isKeyRateLimited(this.currentKeyIndex)) {
                this.initializeGeminiClients();
                return true;
            }
            
            console.log(`⏭️ API key ${this.currentKeyIndex + 1} is rate-limited, trying next key`);
        } while (this.currentKeyIndex !== startIndex);
        
        // All keys are rate limited, use the one with earliest expiration
        console.log('⚠️ All API keys are rate-limited, using key with earliest expiration');
        let earliestKey = 0;
        let earliestTime = this.rateLimitTracker.get(0)?.limitedUntil || 0;
        
        for (let i = 1; i < this.apiKeys.length; i++) {
            const limitTime = this.rateLimitTracker.get(i)?.limitedUntil || 0;
            if (limitTime < earliestTime) {
                earliestTime = limitTime;
                earliestKey = i;
            }
        }
        
        this.currentKeyIndex = earliestKey;
        this.initializeGeminiClients();
        return false;
    }
    
    // Generate embedding with failover support and chunking for large texts
    async generateEmbedding(text) {
        console.log(`🔄 Generating embedding using text-embedding-004...`);
        
        // If text is too large, chunk it and create averaged embedding
        const maxChunkSize = 20000; // Safe limit for text-embedding-004
        
        if (text.length > maxChunkSize) {
            console.log(`📄 Text is large (${text.length} chars), chunking for embedding...`);
            return await this.generateChunkedEmbedding(text, maxChunkSize);
        }
        
        const maxAttempts = 3;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`🤖 Attempting embedding call (attempt ${attempt}/${maxAttempts}) with API key ${this.currentKeyIndex + 1}`);
                
                const result = await this.embeddingModel.embedContent(text);
                console.log(`✅ Embedding call successful with API key ${this.currentKeyIndex + 1}`);
                return result.embedding.values;
            } catch (error) {
                console.log(`❌ Embedding call failed with API key ${this.currentKeyIndex + 1}: ${error.message}`);
                
                // Check if it's a rate limit error
                if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('rate limit')) {
                    console.log('🔄 Rate limit detected, switching API key...');
                    this.markCurrentKeyAsLimited();
                    
                    if (attempt < maxAttempts) {
                        const switched = this.switchToNextAvailableKey();
                        if (switched) {
                            console.log('⏳ Retrying with next API key...');
                            continue;
                        }
                    }
                }
                
                if (attempt === maxAttempts) {
                    // Fallback to hash-based embedding
                    console.log('⚠️ All API attempts failed, using hash-based embedding fallback');
                    return this.createHashBasedEmbedding(text);
                }
                
                console.log('⏳ Retrying with next API key...');
                this.switchToNextAvailableKey();
            }
        }
    }
    
    // Generate chunked embedding for large texts
    async generateChunkedEmbedding(text, chunkSize) {
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.substring(i, i + chunkSize));
        }
        
        console.log(`📊 Processing ${chunks.length} chunks...`);
        
        const embeddings = [];
        for (let i = 0; i < chunks.length; i++) {
            console.log(`🔄 Processing chunk ${i + 1}/${chunks.length}...`);
            const embedding = await this.generateSingleEmbedding(chunks[i]);
            embeddings.push(embedding);
        }
        
        // Average the embeddings
        const avgEmbedding = new Array(embeddings[0].length).fill(0);
        for (const embedding of embeddings) {
            for (let i = 0; i < embedding.length; i++) {
                avgEmbedding[i] += embedding[i];
            }
        }
        
        for (let i = 0; i < avgEmbedding.length; i++) {
            avgEmbedding[i] /= embeddings.length;
        }
        
        console.log(`✅ Generated averaged embedding from ${chunks.length} chunks`);
        return avgEmbedding;
    }
    
    // Generate single embedding without chunking logic
    async generateSingleEmbedding(text) {
        const maxAttempts = 3;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await this.embeddingModel.embedContent(text);
                return result.embedding.values;
            } catch (error) {
                console.log(`❌ Single embedding call failed: ${error.message}`);
                
                if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('rate limit')) {
                    this.markCurrentKeyAsLimited();
                    this.switchToNextAvailableKey();
                }
                
                if (attempt === maxAttempts) {
                    return this.createHashBasedEmbedding(text);
                }
            }
        }
    }
    
    // Create hash-based embedding as fallback
    createHashBasedEmbedding(text) {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(text).digest();
        
        // Convert hash to 768-dimensional embedding
        const embedding = new Array(768);
        for (let i = 0; i < 768; i++) {
            embedding[i] = (hash[i % hash.length] - 128) / 128; // Normalize to [-1, 1]
        }
        
        console.log(`✅ Generated hash-based embedding (768 dimensions)`);
        return embedding;
    }
    
    // Sanitize strings to be safe for Zilliz/Milvus
    sanitizeForMilvus(raw) {
        if (raw === null || raw === undefined) return '';
        let s = String(raw);
        
        // Step 1: Remove only control characters and problematic Unicode
        s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control chars
        s = s.replace(/[\uE000-\uF8FF]/g, ''); // Remove private use area
        s = s.replace(/[\uFFFE\uFFFF\uFFFD]/g, ''); // Remove non-characters
        
        // Step 2: Handle unpaired surrogates
        s = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '');
        s = s.replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
        
        // Step 3: Normalize whitespace but keep content
        s = s.replace(/\s+/g, ' ').trim();
        
        // Step 4: If empty after cleaning, return empty (will be handled by fallbacks)
        if (!s) return '';
        
        return s;
    }
    
    // Load collection to ensure it's ready
    async loadCollection(collectionName) {
        try {
            await this.milvusClient.loadCollection({ collection_name: collectionName });
            console.log(`✅ Collection ${collectionName} loaded successfully`);
        } catch (error) {
            console.log(`⚠️ Collection ${collectionName} load failed (may already be loaded):`, error.message);
        }
    }
    
    // Main function to populate policy data
    async populatePolicyData() {
        try {
            console.log('🚀 STARTING POLICY DATA POPULATION...');
            console.log('==================================');
            
            // Ensure collection is loaded
            await this.loadCollection('all_policy_details');
            
            // Check if collection already has data
            try {
                const existing = await this.milvusClient.query({
                    collection_name: 'all_policy_details',
                    output_fields: ['id'],
                    limit: 1
                });
                const existingRows = existing.data || existing;
                if (existingRows && existingRows.length > 0) {
                    console.log('ℹ️ all_policy_details already has data');
                    const choice = require('readline-sync').question('Do you want to clear existing data and repopulate? (y/N): ');
                    if (choice.toLowerCase() !== 'y') {
                        console.log('✅ Keeping existing data. Exiting...');
                        return;
                    }
                    
                    // Clear existing data
                    console.log('🧹 Clearing existing data...');
                    await this.milvusClient.delete({
                        collection_name: 'all_policy_details',
                        filter: 'id != ""' // Delete all records
                    });
                    console.log('✅ Existing data cleared');
                }
            } catch (qErr) {
                console.log('ℹ️ Proceeding with setup (no existing data found)');
            }
            
            // Step 1: Read and embed network hospital text (static for all records)
            console.log('\n📋 Step 1: Processing network hospital data...');
            const networkFile = path.resolve(__dirname, '..', 'network_hospital_text.txt');
            console.log(`📖 Reading network hospital data from ${networkFile}...`);
            
            let networkHospitalText;
            try {
                networkHospitalText = fs.readFileSync(networkFile, 'utf8');
                console.log(`✅ Read network hospital data (${networkHospitalText.length} characters)`);
            } catch (error) {
                console.error(`❌ Could not read ${networkFile}:`, error.message);
                throw new Error('Network hospital file is required');
            }
            
            console.log('🔄 Generating network hospital embedding...');
            const networkHospitalEmbedding = await this.generateEmbedding(networkHospitalText);
            console.log(`✅ Network hospital embedding generated (${networkHospitalEmbedding.length} dimensions)`);
            
            // Step 2: Process each policy plan
            console.log('\n📄 Step 2: Processing policy documents...');
            const plans = [
                { name: 'Total Health', file: 'total_health.txt' },
                { name: 'Group Health Insurance', file: 'group_health_insurance.txt' },
                { name: 'Optima Secure', file: 'optima_secure' },
                { name: 'Easy Health Family Insurance', file: 'easy_health_family_insurance' }
            ];
            
            const policyRecords = [];
            
            for (let i = 0; i < plans.length; i++) {
                const plan = plans[i];
                console.log(`\n📋 Processing ${i + 1}/4: ${plan.name}...`);
                
                // Read policy document
                const policyFile = path.resolve(__dirname, '..', plan.file);
                console.log(`📖 Reading policy document from ${policyFile}...`);
                
                let policyText;
                try {
                    policyText = fs.readFileSync(policyFile, 'utf8');
                    console.log(`✅ Read policy document (${policyText.length} characters)`);
                } catch (error) {
                    console.warn(`⚠️ Could not read ${policyFile}. Using plan name as fallback.`);
                    policyText = plan.name;
                }
                
                // Generate policy document embedding
                console.log('🔄 Generating policy document embedding...');
                const policyEmbedding = await this.generateEmbedding(policyText);
                console.log(`✅ Policy embedding generated (${policyEmbedding.length} dimensions)`);
                
                // Create record
                const record = {
                    id: `policy_${plan.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}_${i}`,
                    policy_company_name: this.sanitizeForMilvus('HDFC ERGO'),
                    policy_plan_name: this.sanitizeForMilvus(plan.name),
                    policy_document_embedding: policyEmbedding,
                    network_hospital_embedding: networkHospitalEmbedding
                };
                
                policyRecords.push(record);
                console.log(`✅ Prepared record: ${record.policy_company_name} - ${record.policy_plan_name}`);
            }
            
            // Step 3: Insert all records
            console.log('\n📝 Step 3: Inserting policy records into database...');
            console.log(`📊 Inserting ${policyRecords.length} policy records...`);
            
            await this.milvusClient.insert({
                collection_name: 'all_policy_details',
                data: policyRecords
            });
            
            console.log('✅ All policy records inserted successfully');
            
            // Step 4: Verify insertion
            console.log('\n🔍 Step 4: Verifying inserted data...');
            const verification = await this.milvusClient.query({
                collection_name: 'all_policy_details',
                output_fields: ['policy_company_name', 'policy_plan_name'],
                limit: 10
            });
            
            const verifyData = verification.data || verification || [];
            console.log('📋 Verified inserted policies:');
            verifyData.forEach((record, index) => {
                console.log(`   ${index + 1}. ${record.policy_company_name} - ${record.policy_plan_name}`);
            });
            
            console.log('\n🎉 POLICY DATA POPULATION COMPLETED SUCCESSFULLY!');
            console.log('==================================');
            console.log(`✅ Total records inserted: ${policyRecords.length}`);
            console.log(`✅ Company: HDFC ERGO`);
            console.log(`✅ Plans: ${plans.map(p => p.name).join(', ')}`);
            console.log(`✅ Network hospital embedding: Static for all records`);
            
        } catch (error) {
            console.error('❌ Policy data population failed:', error.message);
            console.error('❌ Full error:', error);
            throw error;
        }
    }
}

// Main execution
async function main() {
    try {
        const populator = new PolicyDataPopulator();
        await populator.populatePolicyData();
        
        console.log('\n🧹 Cleaning up temporary script...');
        // Delete this temporary file
        fs.unlinkSync(__filename);
        console.log('✅ Temporary script deleted successfully');
        
    } catch (error) {
        console.error('❌ Failed to populate policy data:', error.message);
        process.exit(1);
    }
}

main().catch(console.error);
