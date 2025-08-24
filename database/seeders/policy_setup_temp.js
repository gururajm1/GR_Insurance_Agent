const { MilvusClient } = require('@zilliz/milvus2-sdk-node');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

class PolicySetupManager {
    constructor() {
        // Zilliz Cloud configuration
        this.milvusClient = new MilvusClient({
            address: 'https://in03-c85a7d5c6e52d9b.api.gcp-us-west1.zillizcloud.com',
            token: 'db_rNmLAOmJpqBCGTzgPbGGkGAMd9Eqh4YF9TBbGjdlP6M:db_rNmLAOmJpqBCGTzgPbGGkGAMd9Eqh4YF9TBbGjdlP6M',
            ssl: true
        });

        // Multiple Gemini API keys for rate limit handling
        this.apiKeys = [
            'AIzaSyBU2u7vwPOqKRhF6Uw5T1oLdPzN6zJhXqA',
            'AIzaSyDQJKP8FGHIJKLMNOPQRSTUVWXYZabcdef',
            'AIzaSyCDEFGHIJKLMNOPQRSTUVWXYZabcdef123'
        ];
        
        this.currentKeyIndex = 0;
        this.rateLimitedKeys = new Map(); // Track rate-limited keys with expiry times
        
        this.initializeGemini();
    }

    initializeGemini() {
        const availableKey = this.getAvailableApiKey();
        console.log(`🔑 Initializing Gemini clients with API key ${this.currentKeyIndex + 1}`);
        
        this.genAI = new GoogleGenerativeAI(availableKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
        this.embeddingModel = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
    }

    getAvailableApiKey() {
        const now = Date.now();
        
        // Clean up expired rate limits
        for (const [keyIndex, expiryTime] of this.rateLimitedKeys.entries()) {
            if (now > expiryTime) {
                this.rateLimitedKeys.delete(keyIndex);
                console.log(`✅ API key ${keyIndex + 1} rate limit expired, now available`);
            }
        }
        
        // Find first non-rate-limited key
        for (let i = 0; i < this.apiKeys.length; i++) {
            if (!this.rateLimitedKeys.has(i)) {
                this.currentKeyIndex = i;
                return this.apiKeys[i];
            }
        }
        
        // If all keys are rate-limited, use the one with earliest expiration
        let earliestExpiry = Infinity;
        let earliestKeyIndex = 0;
        
        for (const [keyIndex, expiryTime] of this.rateLimitedKeys.entries()) {
            if (expiryTime < earliestExpiry) {
                earliestExpiry = expiryTime;
                earliestKeyIndex = keyIndex;
            }
        }
        
        console.log('⚠️ All API keys are rate-limited, using key with earliest expiration');
        this.currentKeyIndex = earliestKeyIndex;
        return this.apiKeys[earliestKeyIndex];
    }

    markCurrentKeyAsLimited() {
        const limitDuration = 10 * 60 * 1000; // 10 minutes
        const expiryTime = Date.now() + limitDuration;
        this.rateLimitedKeys.set(this.currentKeyIndex, expiryTime);
        console.log(`🚫 Marking API key ${this.currentKeyIndex + 1} as rate-limited for 10 minutes`);
    }

    async callGeminiWithFailover(model, prompt, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🤖 Attempting Gemini call (attempt ${attempt}/${maxRetries}) with API key ${this.currentKeyIndex + 1}`);
                const result = await model.generateContent(prompt);
                console.log(`✅ Gemini call successful with API key ${this.currentKeyIndex + 1}`);
                return result.response.text();
            } catch (error) {
                console.log(`❌ Gemini call failed with API key ${this.currentKeyIndex + 1}: ${error.message}`);
                
                if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('rate limit')) {
                    console.log('🔄 Rate limit detected, switching API key...');
                    this.markCurrentKeyAsLimited();
                    
                    if (attempt < maxRetries) {
                        console.log('⏳ Retrying with next API key...');
                        this.initializeGemini(); // Switch to next available key
                        continue;
                    }
                }
                
                if (attempt === maxRetries) {
                    throw new Error(`All API key attempts failed. Last error: ${error.message}`);
                }
            }
        }
    }

    async generateEmbedding(text) {
        try {
            console.log('🔄 Generating embedding using Gemini...');
            const result = await this.embeddingModel.embedContent(text);
            return result.embedding.values;
        } catch (error) {
            console.error('Embedding generation failed:', error.message);
            
            if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('rate limit')) {
                console.log('🔄 Rate limit detected, switching API key...');
                this.markCurrentKeyAsLimited();
                
                try {
                    this.initializeGemini();
                    const retryResult = await this.embeddingModel.embedContent(text);
                    return retryResult.embedding.values;
                } catch (retryError) {
                    console.error('Retry embedding failed:', retryError.message);
                    throw new Error(`Embedding generation failed: ${retryError.message}`);
                }
            }
            
            throw new Error(`Embedding generation failed: ${error.message}`);
        }
    }

    // Sanitize strings for Milvus/Zilliz
    sanitizeForMilvus(raw) {
        if (raw === null || raw === undefined) return '';
        let s = String(raw);
        
        // Remove only control characters and problematic Unicode
        s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control chars
        s = s.replace(/[\uE000-\uF8FF]/g, ''); // Remove private use area
        s = s.replace(/[\uFFFE\uFFFF\uFFFD]/g, ''); // Remove non-characters
        
        // Handle unpaired surrogates
        s = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '');
        s = s.replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
        
        // Normalize whitespace but keep content
        s = s.replace(/\s+/g, ' ').trim();
        
        return s;
    }

    async createPolicyCollection() {
        try {
            console.log('🆕 Creating all_policy_details collection...');
            
            await this.milvusClient.createCollection({
                collection_name: 'all_policy_details',
                fields: [
                    {
                        name: 'id',
                        data_type: 'VarChar',
                        max_length: 100,
                        is_primary_key: true
                    },
                    {
                        name: 'policy_company_name',
                        data_type: 'VarChar',
                        max_length: 255
                    },
                    {
                        name: 'policy_plan_name',
                        data_type: 'VarChar',
                        max_length: 255
                    },
                    {
                        name: 'policy_document_embedding',
                        data_type: 'FloatVector',
                        dim: 768
                    },
                    {
                        name: 'network_hospital_embedding',
                        data_type: 'FloatVector',
                        dim: 768
                    }
                ]
            });
            
            console.log('✅ Successfully created all_policy_details collection');
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log('ℹ️ Collection all_policy_details already exists');
            } else {
                console.error('❌ Error creating collection:', error.message);
                throw error;
            }
        }
    }

    async createIndex() {
        try {
            console.log('🛠️ Creating indexes for all_policy_details collection...');
            
            await this.milvusClient.createIndex({
                collection_name: 'all_policy_details',
                field_name: 'policy_document_embedding',
                index_type: 'AUTOINDEX',
                metric_type: 'COSINE',
                params: {}
            });

            await this.milvusClient.createIndex({
                collection_name: 'all_policy_details',
                field_name: 'network_hospital_embedding',
                index_type: 'AUTOINDEX',
                metric_type: 'COSINE',
                params: {}
            });
            
            console.log('✅ Indexes created successfully');
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log('ℹ️ Indexes already exist');
            } else {
                console.error('❌ Error creating indexes:', error.message);
            }
        }
    }

    async loadCollection() {
        try {
            console.log('📥 Loading all_policy_details collection...');
            await this.milvusClient.loadCollection({
                collection_name: 'all_policy_details'
            });
            console.log('✅ Collection loaded successfully');
        } catch (error) {
            console.error('❌ Error loading collection:', error.message);
        }
    }

    async readFileContent(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            console.log(`📖 Read ${filePath} successfully`);
            return content;
        } catch (error) {
            console.error(`❌ Error reading ${filePath}:`, error.message);
            throw error;
        }
    }

    async setupPolicyData() {
        try {
            console.log('🚀 Starting policy data setup...');
            
            // Step 1: Create collection
            await this.createPolicyCollection();
            
            // Step 2: Create indexes
            await this.createIndex();
            
            // Step 3: Load collection
            await this.loadCollection();
            
            // Step 4: Read network hospital text (static for all policies)
            console.log('📋 Reading network hospital data...');
            const networkHospitalText = await this.readFileContent('network_hospital_text.txt');
            console.log('🔄 Generating network hospital embedding...');
            const networkHospitalEmbedding = await this.generateEmbedding(networkHospitalText);
            
            // Step 5: Policy plans to process
            const policyPlans = [
                {
                    name: 'Total Health',
                    file: 'total_health.txt'
                },
                {
                    name: 'Group Health Insurance',
                    file: 'group_health_insurance.txt'
                },
                {
                    name: 'Optima Secure',
                    file: 'optima_secure'
                },
                {
                    name: 'Easy Health Family Insurance',
                    file: 'easy_health_family_insurance'
                }
            ];
            
            // Step 6: Process each policy plan
            const policyData = [];
            
            for (const plan of policyPlans) {
                console.log(`\n📄 Processing policy: ${plan.name}`);
                
                // Read policy document
                const policyText = await this.readFileContent(plan.file);
                
                // Generate policy document embedding
                console.log(`🔄 Generating embedding for ${plan.name}...`);
                const policyEmbedding = await this.generateEmbedding(policyText);
                
                // Prepare data for insertion
                const sanitizedCompanyName = this.sanitizeForMilvus('HDFC ERGO').substring(0, 255);
                const sanitizedPlanName = this.sanitizeForMilvus(plan.name).substring(0, 255);
                
                const policyRecord = {
                    id: `policy_${plan.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
                    policy_company_name: sanitizedCompanyName,
                    policy_plan_name: sanitizedPlanName,
                    policy_document_embedding: policyEmbedding,
                    network_hospital_embedding: networkHospitalEmbedding
                };
                
                policyData.push(policyRecord);
                
                console.log(`✅ Prepared data for ${plan.name}`);
                console.log(`   Company: ${policyRecord.policy_company_name}`);
                console.log(`   Plan: ${policyRecord.policy_plan_name}`);
                console.log(`   Policy Embedding Length: ${policyRecord.policy_document_embedding.length}`);
                console.log(`   Network Hospital Embedding Length: ${policyRecord.network_hospital_embedding.length}`);
            }
            
            // Step 7: Insert all policy data
            console.log('\n📝 Inserting all policy data...');
            await this.milvusClient.insert({
                collection_name: 'all_policy_details',
                data: policyData
            });
            
            console.log('✅ All policy data inserted successfully!');
            console.log(`📊 Total policies inserted: ${policyData.length}`);
            
            // Step 8: Verify insertion
            console.log('\n🔍 Verifying data insertion...');
            const queryResult = await this.milvusClient.query({
                collection_name: 'all_policy_details',
                filter: 'policy_company_name == "HDFC ERGO"',
                output_fields: ['id', 'policy_company_name', 'policy_plan_name'],
                limit: 10
            });
            
            console.log('📋 Inserted policies:');
            queryResult.forEach((record, index) => {
                console.log(`   ${index + 1}. ${record.policy_plan_name} (ID: ${record.id})`);
            });
            
            return true;
            
        } catch (error) {
            console.error('❌ Policy setup failed:', error.message);
            throw error;
        }
    }
}

// Main execution
async function main() {
    const setupManager = new PolicySetupManager();
    
    try {
        await setupManager.setupPolicyData();
        console.log('\n🎉 POLICY SETUP COMPLETED SUCCESSFULLY!');
        console.log('📋 Summary:');
        console.log('   ✅ Created all_policy_details collection');
        console.log('   ✅ Generated embeddings for 4 policy documents');
        console.log('   ✅ Generated embedding for network hospital data');
        console.log('   ✅ Inserted all policy data with HDFC ERGO as default company');
        console.log('   ✅ Network hospital embedding is static for all policies');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

main().catch(console.error);
