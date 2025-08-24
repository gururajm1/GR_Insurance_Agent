#!/usr/bin/env node

// ZILLIZ MILVUS SCHEMAS FOR INSURANCE CLAIM AGENT

const { MilvusClient } = require('@zilliz/milvus2-sdk-node');
require('dotenv').config();

const client = new MilvusClient({
    address: process.env.MILVUS_URI,
    token: process.env.MILVUS_TOKEN
});

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

const INSURANCE_POLICIES_SCHEMA = {
    collection_name: 'insurance_policies',
    description: 'Insurance policy documents with embeddings',
    fields: [
        {
            name: 'id',
            data_type: 'VarChar',
            max_length: 100,
            is_primary_key: true,
            description: 'Unique policy identifier'
        },
        {
            name: 'email',
            data_type: 'VarChar',
            max_length: 255,
            description: 'Customer email address'
        },
        {
            name: 'company_name',
            data_type: 'VarChar',
            max_length: 255,
            description: 'Insurance company name'
        },
        {
            name: 'policy_name',
            data_type: 'VarChar',
            max_length: 255,
            description: 'Policy name/type'
        },
        {
            name: 'purchase_year',
            data_type: 'Int64',
            description: 'Year policy was purchased'
        },
        {
            name: 'pricing_embedding',
            data_type: 'FloatVector',
            dim: 768, // Gemini text-embedding-004 dimension
            description: 'Pricing and coverage amount embeddings'
        },
        {
            name: 'covered_conditions_embedding',
            data_type: 'FloatVector',
            dim: 768,
            description: 'Covered conditions and procedures embeddings'
        },
        {
            name: 'excluded_conditions_embedding',
            data_type: 'FloatVector',
            dim: 768,
            description: 'Excluded conditions and procedures embeddings'
        },
        {
            name: 'network_hospitals_embedding',
            data_type: 'FloatVector',
            dim: 768,
            description: 'Network hospitals and providers embeddings'
        },
        {
            name: 'policy_text',
            data_type: 'VarChar',
            max_length: 65535,
            description: 'Full policy document text'
        },
        {
            name: 'sum_insured',
            data_type: 'Float',
            description: 'Total coverage amount for the policy'
        },
        {
            name: 'is_active',
            data_type: 'Bool',
            description: 'Whether the policy is currently active (true) or expired (false)'
        },
        {
            name: 'created_at',
            data_type: 'Int64',
            description: 'Creation timestamp'
        }
    ]
};

const INSURANCE_CLAIMS_SCHEMA = {
    collection_name: 'insurance_claims',
    description: 'Insurance claim documents with embeddings',
    fields: [
        {
            name: 'id',
            data_type: 'VarChar',
            max_length: 100,
            is_primary_key: true,
            description: 'Unique claim identifier'
        },
        {
            name: 'email',
            data_type: 'VarChar',
            max_length: 255,
            description: 'Customer email address'
        },
        {
            name: 'claim_type',
            data_type: 'VarChar',
            max_length: 100,
            description: 'Type of claim (accident, illness, etc.)'
        },
        {
            name: 'claim_amount',
            data_type: 'Float',
            description: 'Claimed amount'
        },
        {
            name: 'document_embedding',
            data_type: 'FloatVector',
            dim: 768,
            description: 'Hospital/medical document embeddings'
        },
        {
            name: 'document_text',
            data_type: 'VarChar',
            max_length: 65535,
            description: 'Full document text content'
        },
        {
            name: 'hospital_name',
            data_type: 'VarChar',
            max_length: 255,
            description: 'Name of hospital/medical facility'
        },
        {
            name: 'treatment_date',
            data_type: 'VarChar',
            max_length: 50,
            description: 'Date of medical treatment'
        },
        {
            name: 'status',
            data_type: 'VarChar',
            max_length: 50,
            description: 'Claim status (pending, approved, rejected)'
        },
        {
            name: 'created_at',
            data_type: 'Int64',
            description: 'Creation timestamp'
        }
    ]
};

const CLAIM_CONVERSATIONS_SCHEMA = {
    collection_name: 'claim_conversations',
    description: 'Customer conversations and claim details',
    fields: [
        {
            name: 'id',
            data_type: 'VarChar',
            max_length: 100,
            is_primary_key: true,
            description: 'Unique conversation identifier'
        },
        {
            name: 'email',
            data_type: 'VarChar',
            max_length: 255,
            description: 'Customer email address'
        },
        {
            name: 'conversation_embedding',
            data_type: 'FloatVector',
            dim: 768,
            description: 'Customer conversation embeddings'
        },
        {
            name: 'conversation_text',
            data_type: 'VarChar',
            max_length: 65535,
            description: 'Full conversation text'
        },
        {
            name: 'claim_reason',
            data_type: 'VarChar',
            max_length: 1000,
            description: 'Customer stated claim reason'
        },
        {
            name: 'policy_company',
            data_type: 'VarChar',
            max_length: 255,
            description: 'Insurance company name'
        },
        {
            name: 'policy_type',
            data_type: 'VarChar',
            max_length: 255,
            description: 'Type of insurance policy'
        },
        {
            name: 'sentiment_score',
            data_type: 'Float',
            description: 'Customer sentiment analysis score'
        },
        {
            name: 'urgency_level',
            data_type: 'VarChar',
            max_length: 20,
            description: 'Urgency level (always critical for claim requests)'
        },
        {
            name: 'created_at',
            data_type: 'Int64',
            description: 'Creation timestamp'
        }
    ]
};

const CLAIM_STATUS_SCHEMA = {
    collection_name: 'claim_status',
    description: 'Claim approval status tracking',
    fields: [
        {
            name: 'email',
            data_type: 'VarChar',
            max_length: 65535,
            is_primary_key: true,
            description: 'Customer email address (Primary Key)'
        },
        {
            name: 'vector',
            data_type: 'FloatVector',
            dim: 2,
            description: 'Simple status vector for indexing'
        },
        {
            name: 'is_requested',
            data_type: 'Bool',
            description: 'Whether claim has been requested'
        },
        {
            name: 'is_approved',
            data_type: 'Bool',
            description: 'Whether claim has been approved by admin'
        },
        {
            name: 'claim_amount',
            data_type: 'Float',
            description: 'Claim amount requested'
        },
        {
            name: 'request_date',
            data_type: 'Int64',
            description: 'Date when claim was requested'
        },
        {
            name: 'approval_date',
            data_type: 'Int64',
            description: 'Date when claim was approved (if approved)'
        },
        {
            name: 'policy_company',
            data_type: 'VarChar',
            max_length: 255,
            description: 'Insurance company name'
        },
        {
            name: 'claim_reason',
            data_type: 'VarChar',
            max_length: 1000,
            description: 'Reason for the claim'
        }
    ]
};

// ============================================================================
// INDEX CONFIGURATIONS
// ============================================================================

const createIndexConfig = (fieldName) => ({
    field_name: fieldName,
    index_name: `${fieldName}_index`,
    index_type: 'HNSW', // High performance index for Zilliz Cloud
    metric_type: 'COSINE', // Cosine similarity for embeddings
    params: {
        M: 16,
        efConstruction: 256
    }
});

// ============================================================================
// SCHEMA CREATION FUNCTIONS
// ============================================================================

async function createInsuranceCollections() {
    console.log('🔧 Creating Zilliz collections for Insurance Claim Agent...\n');

    try {
        // 1. Create Insurance Policies Collection
        console.log('📋 Creating insurance_policies collection...');
        
        const policyExists = await client.hasCollection({
            collection_name: 'insurance_policies'
        });

        if (policyExists.value) {
            console.log('⚠️ insurance_policies collection already exists');
        } else {
            await client.createCollection(INSURANCE_POLICIES_SCHEMA);
            
            // Create indexes for vector fields
            const vectorFields = [
                'pricing_embedding',
                'covered_conditions_embedding', 
                'excluded_conditions_embedding',
                'network_hospitals_embedding'
            ];

            for (const field of vectorFields) {
                await client.createIndex({
                    collection_name: 'insurance_policies',
                    ...createIndexConfig(field)
                });
                console.log(`✅ Created index for ${field}`);
            }

            await client.loadCollection({ collection_name: 'insurance_policies' });
            console.log('✅ insurance_policies collection created and loaded');
        }

        // 2. Create Insurance Claims Collection
        console.log('\n📋 Creating insurance_claims collection...');
        
        const claimsExists = await client.hasCollection({
            collection_name: 'insurance_claims'
        });

        if (claimsExists.value) {
            console.log('⚠️ insurance_claims collection already exists');
        } else {
            await client.createCollection(INSURANCE_CLAIMS_SCHEMA);
            
            await client.createIndex({
                collection_name: 'insurance_claims',
                ...createIndexConfig('document_embedding')
            });

            await client.loadCollection({ collection_name: 'insurance_claims' });
            console.log('✅ insurance_claims collection created and loaded');
        }

        // 3. Create Claim Conversations Collection
        console.log('\n📋 Creating claim_conversations collection...');
        
        const conversationsExists = await client.hasCollection({
            collection_name: 'claim_conversations'
        });

        if (conversationsExists.value) {
            console.log('⚠️ claim_conversations collection already exists');
        } else {
            await client.createCollection(CLAIM_CONVERSATIONS_SCHEMA);
            
            await client.createIndex({
                collection_name: 'claim_conversations',
                ...createIndexConfig('conversation_embedding')
            });

            await client.loadCollection({ collection_name: 'claim_conversations' });
            console.log('✅ claim_conversations collection created and loaded');
        }

        // 4. Create Claim Status Collection
        console.log('\n📋 Creating claim_status collection...');
        
        const statusExists = await client.hasCollection({
            collection_name: 'claim_status'
        });

        if (statusExists.value) {
            console.log('⚠️ claim_status collection already exists');
        } else {
            await client.createCollection(CLAIM_STATUS_SCHEMA);
            
            await client.createIndex({
                collection_name: 'claim_status',
                field_name: 'vector',
                index_name: 'vector_index',
                index_type: 'HNSW',
                metric_type: 'L2',
                params: { M: 16, efConstruction: 256 }
            });

            await client.loadCollection({ collection_name: 'claim_status' });
            console.log('✅ claim_status collection created and loaded');
        }

        console.log('\n🎉 All collections created successfully!');
        
        // Show collection stats
        console.log('\n📊 Collection Statistics:');
        const collections = ['insurance_policies', 'insurance_claims', 'claim_conversations', 'claim_status'];
        
        for (const collection of collections) {
            const stats = await client.getCollectionStatistics({
                collection_name: collection
            });
            console.log(`${collection}: ${stats.stats.row_count} records`);
        }

    } catch (error) {
        console.error('❌ Error creating collections:', error.message);
        throw error;
    }
}

async function dropAllCollections() {
    console.log('🗑️ Dropping all insurance collections...\n');
    
    const collections = ['insurance_policies', 'insurance_claims', 'claim_conversations', 'claim_status'];
    
    for (const collection of collections) {
        try {
            const exists = await client.hasCollection({ collection_name: collection });
            if (exists.value) {
                await client.dropCollection({ collection_name: collection });
                console.log(`✅ Dropped ${collection}`);
            }
        } catch (error) {
            console.log(`⚠️ Failed to drop ${collection}: ${error.message}`);
        }
    }
    
    console.log('🎉 All collections dropped!');
}

async function showCollectionInfo() {
    console.log('📋 Insurance Agent Collections Info:\n');
    
    const collections = [
        { name: 'insurance_policies', schema: INSURANCE_POLICIES_SCHEMA },
        { name: 'insurance_claims', schema: INSURANCE_CLAIMS_SCHEMA },
        { name: 'claim_conversations', schema: CLAIM_CONVERSATIONS_SCHEMA },
        { name: 'claim_status', schema: CLAIM_STATUS_SCHEMA }
    ];
    
    for (const collection of collections) {
        console.log(`📊 ${collection.name.toUpperCase()}`);
        console.log(`Description: ${collection.schema.description}`);
        console.log('Fields:');
        
        collection.schema.fields.forEach(field => {
            const type = field.data_type === 'FloatVector' ? 
                `${field.data_type}(${field.dim})` : 
                field.data_type + (field.max_length ? `(${field.max_length})` : '');
            
            const primary = field.is_primary_key ? ' [PRIMARY]' : '';
            console.log(`  - ${field.name}: ${type}${primary}`);
        });
        console.log('');
    }
}

// ============================================================================
// COMMAND LINE INTERFACE
// ============================================================================

async function main() {
    const command = process.argv[2] || 'create';
    
    console.log('🏥 Zilliz Schemas for Insurance Claim Agent\n');
    
    try {
        switch (command) {
            case 'create':
                await createInsuranceCollections();
                break;
            case 'drop':
                await dropAllCollections();
                break;
            case 'info':
                await showCollectionInfo();
                break;
            case 'recreate':
                await dropAllCollections();
                await new Promise(resolve => setTimeout(resolve, 2000));
                await createInsuranceCollections();
                break;
            default:
                console.log('Usage:');
                console.log('  node zilliz-schemas.js create    - Create all collections');
                console.log('  node zilliz-schemas.js drop      - Drop all collections');
                console.log('  node zilliz-schemas.js info      - Show schema info');
                console.log('  node zilliz-schemas.js recreate  - Drop and recreate all collections');
        }
    } catch (error) {
        console.error('❌ Operation failed:', error.message);
        
        if (error.message.includes('connect')) {
            console.log('\n🔧 Connection troubleshooting:');
            console.log('1. Check MILVUS_URI in .env file');
            console.log('2. Check MILVUS_TOKEN in .env file');
            console.log('3. Verify Zilliz Cloud cluster is running');
        }
        
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

// Export schemas for use in other files
module.exports = {
    INSURANCE_POLICIES_SCHEMA,
    INSURANCE_CLAIMS_SCHEMA,
    CLAIM_CONVERSATIONS_SCHEMA,
    CLAIM_STATUS_SCHEMA,
    createInsuranceCollections,
    dropAllCollections,
    showCollectionInfo
};
