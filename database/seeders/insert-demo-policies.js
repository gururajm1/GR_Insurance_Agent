#!/usr/bin/env node

// INSERT DEMO POLICY RECORDS WITH REAL INDIAN INSURANCE COMPANIES

const { MilvusClient } = require('@zilliz/milvus2-sdk-node');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const client = new MilvusClient({
    address: process.env.MILVUS_URI,
    token: process.env.MILVUS_TOKEN
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

// ============================================================================
// DEMO POLICY DATA - REAL INDIAN INSURANCE COMPANIES
// ============================================================================

const DEMO_POLICIES = [
    {
        email: 'gururajmemail20@gmail.com',
        company_name: 'HDFC ERGO',
        policy_name: 'Optima Secure',
        purchase_year: 2021,
        sum_insured: 1000000.0,  // ₹10,00,000
        is_active: false,  // Making this policy expired
        policy_document: `
HDFC ERGO OPTIMA SECURE POLICY DOCUMENT

COVERAGE DETAILS:
- Sum Insured: ₹10,00,000 per person per year
- Family Floater: ₹20,00,000 per family per year
- Room Rent: Single AC room up to 2% of sum insured per day
- ICU Charges: Up to 5% of sum insured per day
- Pre-hospitalization: 60 days coverage
- Post-hospitalization: 180 days coverage

COVERED CONDITIONS & PROCEDURES:
- Accidental injuries and emergency treatment
- Surgical procedures including cardiac, neurological, orthopedic
- Cancer treatment including chemotherapy and radiotherapy
- Kidney dialysis and transplant procedures
- Maternity expenses after 2 years waiting period
- Mental illness treatment (inpatient)
- COVID-19 treatment and complications
- Organ transplant procedures
- Emergency ambulance charges up to ₹2,000

EXCLUSIONS:
- Pre-existing conditions for first 3 years (unless declared)
- Cosmetic and aesthetic treatments
- Dental treatment (unless due to accident)
- Pregnancy complications in first year
- Self-inflicted injuries and suicide attempts
- War and nuclear risks
- Experimental treatments not approved by medical board

NETWORK HOSPITALS:
- Apollo Hospitals (All branches across India)
- Fortis Healthcare Network
- Max Healthcare Network
- Manipal Hospitals
- Narayana Health
- Aster Medcity
- Columbia Asia Hospitals
- Global Hospital Network
- Yashoda Hospitals
- Continental Hospitals

PRICING STRUCTURE:
- Annual Premium: ₹15,000 for individual (age 30-35)
- Family Premium: ₹25,000 for family of 4
- Deductible: ₹5,000 per claim
- Co-payment: 10% for non-network hospitals
- No Claim Bonus: 10% discount each year (max 50%)
- Health Check-up: Free annual health check after 1 year
        `
    },
    {
        email: 'gururaj.m2021csbs@sece.ac.in',
        company_name: 'HDFC ERGO',
        policy_name: 'Optima Secure',
        purchase_year: 2020,
        sum_insured: 1500000.0,  // ₹15,00,000
        is_active: true,  // Making this policy expired too
        policy_document: `
ICICI LOMBARD COMPLETE HEALTH INSURANCE POLICY

COVERAGE BENEFITS:
- Sum Insured: ₹15,00,000 individual / ₹30,00,000 family
- Room & Board: Private AC room up to 2% of sum insured
- ICU/CCU: Up to 5% of sum insured per day
- Surgical Coverage: 100% of medical expenses
- Pre-hospitalization: 30 days before admission
- Post-hospitalization: 60 days after discharge

MEDICAL CONDITIONS COVERED:
- Heart diseases and cardiac procedures
- Cancer treatment and oncology procedures
- Neurological disorders and brain surgery
- Kidney diseases and dialysis treatment
- Liver transplant and hepatic procedures
- Respiratory diseases and lung treatments
- Orthopedic surgeries and joint replacements
- Emergency treatments and accidents
- Infectious diseases including COVID-19
- Digestive system disorders

NOT COVERED (EXCLUSIONS):
- Infertility treatments and IVF procedures
- Plastic surgery for cosmetic purposes
- Dental treatments except accidental injuries
- Alternative medicine treatments (Ayurveda, Homeopathy)
- Pre-existing diseases in first 4 years
- Substance abuse related treatments
- Intentional self-harm
- Congenital diseases (birth defects)

HOSPITAL NETWORK:
- All India Institute of Medical Sciences (AIIMS)
- Medanta - The Medicity
- Artemis Hospitals
- BLK Super Speciality Hospital
- Sir Ganga Ram Hospital
- Indraprastha Apollo Hospital
- Fortis Escorts Hospital
- Max Super Speciality Hospitals
- Asian Hospital Network
- Wockhardt Hospitals

PREMIUM & COSTS:
- Annual Premium: ₹18,500 (individual, age 28-32)
- Family Premium: ₹32,000 for spouse + 2 children
- Deductible Amount: ₹10,000 per policy year
- Co-insurance: 20% for treatments above ₹1,00,000
- Renewal Bonus: 5% premium discount (cumulative up to 25%)
- Wellness Benefit: ₹2,000 health check-up annually
        `
    },
    {
        email: 'gururaj.m2264@gmail.com',
        company_name: 'Bajaj Allianz',
        policy_name: 'Health Guard',
        purchase_year: 2022,
        sum_insured: 800000.0,  // ₹8,00,000
        is_active: true,  // Active policy
        policy_document: `
BAJAJ ALLIANZ HEALTH GUARD INSURANCE POLICY

POLICY COVERAGE:
- Individual Sum Insured: ₹8,00,000 per year
- Family Floater: ₹16,00,000 for family coverage
- Hospitalization: Unlimited days subject to sum insured
- Day Care Procedures: 150+ procedures covered
- Pre & Post Hospitalization: 45 days before, 90 days after
- Emergency Ambulance: Up to ₹1,500 per emergency

DISEASES & TREATMENTS COVERED:
- Cardiovascular diseases and heart surgeries
- Oncology treatments and cancer therapies
- Neurological conditions including stroke treatment
- Gastrointestinal surgeries and treatments
- Pulmonary diseases and respiratory treatments
- Endocrine disorders including diabetes complications
- Infectious diseases and epidemic treatments
- Accidental injuries and trauma care
- Emergency medical conditions
- Critical illness benefits

CONDITIONS NOT COVERED:
- Waiting period diseases: 2 years for specific conditions
- Cosmetic treatments and elective surgeries
- Fertility treatments and assisted reproduction
- Dental care except accident-related
- Vision correction surgeries (LASIK, etc.)
- Mental health treatments (except emergencies)
- War, riots, and terrorism-related injuries
- Sports injuries from professional sports
- Pre-existing conditions for 3 years

PREFERRED PROVIDER NETWORK:
- Star Hospitals Network
- Care Hospitals
- Rainbow Children's Hospitals
- Kims Hospitals
- Aware Gleneagles Global Hospitals
- AIG Hospitals
- Sunshine Hospitals
- Continental Hospitals Network
- Yashoda Super Speciality Hospitals
- Apollo Health City

FINANCIAL TERMS:
- Premium: ₹12,800 per annum (age 25-30, individual)
- Family Premium: ₹22,500 (2 adults + 2 children)
- Deductible: ₹7,500 per claim
- Network Hospital: 0% co-payment
- Non-Network: 25% co-payment by insured
- No Claim Bonus: Up to 100% increase in sum insured
        `
    },
    {
        email: 'gururajmemail21@gmail.com',
        company_name: 'Star Health Insurance',
        policy_name: 'Super Surplus',
        purchase_year: 2019,
        sum_insured: 1000000.0,  // ₹10,00,000
        is_active: true,  // Active policy
        policy_document: `
STAR HEALTH SUPER SURPLUS INSURANCE POLICY

COMPREHENSIVE COVERAGE:
- Sum Insured Options: ₹5,00,000 to ₹1,00,00,000
- Room Rent: Single AC room without any sub-limits
- ICU Charges: Covered as per actuals without limits
- Hospitalization: Minimum 24 hours (day care included)
- Pre-hospitalization: 30 days coverage
- Post-hospitalization: 60 days follow-up care

MEDICAL SERVICES INCLUDED:
- All surgical procedures including robotic surgery
- Chemotherapy and radiation therapy for cancer
- Dialysis for kidney patients (chronic and acute)
- Organ transplantation procedures
- Cardiac interventions and bypass surgeries
- Neurological procedures and brain surgeries
- Orthopedic surgeries including joint replacements
- Maternity and newborn baby coverage (after waiting period)
- Mental health treatment (inpatient psychiatric care)
- Emergency and trauma care

POLICY EXCLUSIONS:
- Cosmetic and plastic surgery (except reconstructive)
- Infertility and assisted reproductive treatments
- Experimental or unproven medical treatments
- Dental treatment unless caused by accident
- Congenital internal diseases
- Self-inflicted injuries and substance abuse
- War risks and nuclear contamination
- Pre-existing diseases (48 months waiting period)

HEALTHCARE NETWORK:
- Star Hospitals (Proprietary network)
- KIMS Hospitals Network
- Care Hospitals Group
- Omega Hospitals
- Continental Hospitals
- Aware Gleneagles Global Hospitals
- AIG Hospitals Network
- Sunshine Hospitals Group
- Gleneagles Global Health City
- Asian Institute of Gastroenterology

PRICING INFORMATION:
- Individual Premium: ₹14,200 (₹10,00,000 cover, age 30-35)
- Family Premium: ₹26,800 (2 adults + 2 children)
- Zero Deductible option available
- Co-payment: 10% for senior citizens above 60
- Loyalty Bonus: 10% sum insured increase every claim-free year
- Health Check-up: Complimentary annual health screening
        `
    },
    {
        email: 'gururajmemail22@gmail.com',
        company_name: 'New India Assurance',
        policy_name: 'Mediclaim Plus',
        purchase_year: 2023,
        sum_insured: 750000.0,  // ₹7,50,000
        is_active: true,  // Active policy
        policy_document: `
NEW INDIA ASSURANCE MEDICLAIM PLUS POLICY

POLICY BENEFITS:
- Sum Insured: ₹7,50,000 individual / ₹15,00,000 family
- Hospitalization: Medically necessary inpatient treatment
- Day Care Treatment: 180+ procedures without hospitalization
- Pre-hospitalization Expenses: 30 days prior to admission
- Post-hospitalization Expenses: 60 days after discharge
- Ambulance Charges: Up to ₹1,000 per hospitalization

COVERED MEDICAL CONDITIONS:
- General surgical procedures
- Cardiac diseases and heart operations
- Cancer treatment including targeted therapy
- Kidney disorders and transplant procedures
- Neurological conditions and brain surgery
- Liver diseases and hepatic treatments
- Respiratory system disorders
- Digestive system diseases and treatments
- Accidental injuries and emergency care
- COVID-19 and pandemic-related treatments

EXCLUSIONS AND LIMITATIONS:
- Cosmetic surgery and aesthetic procedures
- Infertility treatments and IVF procedures
- Dental treatment except accident-related
- Mental illness and psychiatric disorders
- Congenital diseases and birth defects
- Pre-existing conditions for 36 months
- Pregnancy-related expenses in first year
- Self-inflicted injuries and suicide attempts
- War, terrorism, and nuclear risks

EMPANELLED HOSPITALS:
- Government Medical College Hospitals
- AIIMS Network (All India Institute of Medical Sciences)
- PGIMER Chandigarh
- JIPMER Puducherry
- Regional Cancer Centre, Thiruvananthapuram
- Sanjay Gandhi Postgraduate Institute
- Nizam's Institute of Medical Sciences
- King George Medical University
- Government General Hospital, Chennai
- B.J. Medical College, Ahmedabad

PREMIUM STRUCTURE:
- Annual Premium: ₹11,500 (individual, ₹7,50,000 cover, age 35-40)
- Family Premium: ₹19,800 (family floater)
- Government Employee Discount: 10% on premium
- Senior Citizen Discount: 5% for policy holders above 60
- No Claim Bonus: 20% cumulative bonus (maximum 100%)
- Medical Check-up: Mandatory for sum insured above ₹5,00,000
        `
    }
];

// ============================================================================
// EMBEDDING GENERATION FUNCTIONS
// ============================================================================

async function generateEmbedding(text) {
    try {
        const result = await embeddingModel.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error('Embedding generation failed:', error.message);
        // Return dummy embedding for fallback
        return Array(768).fill(0).map(() => Math.random() * 0.1);
    }
}

function extractPolicySection(policyDocument, sectionType) {
    const sections = {
        pricing: extractSection(policyDocument, ['PRICING', 'PREMIUM', 'COST', 'FINANCIAL']),
        covered: extractSection(policyDocument, ['COVERED', 'BENEFITS', 'INCLUDED', 'MEDICAL CONDITIONS COVERED']),
        excluded: extractSection(policyDocument, ['EXCLUSION', 'NOT COVERED', 'LIMITATION']),
        hospitals: extractSection(policyDocument, ['NETWORK', 'HOSPITAL', 'PROVIDER', 'EMPANELLED'])
    };
    
    return sections[sectionType] || `Standard ${sectionType} terms apply for this insurance policy.`;
}

function extractSection(text, keywords) {
    const lines = text.split('\n');
    let sectionLines = [];
    let inSection = false;
    
    for (const line of lines) {
        const upperLine = line.toUpperCase();
        
        // Check if line contains any of the keywords
        const hasKeyword = keywords.some(keyword => upperLine.includes(keyword));
        
        if (hasKeyword) {
            inSection = true;
            sectionLines.push(line);
        } else if (inSection) {
            if (line.trim() === '' || line.match(/^[A-Z\s]+:$/)) {
                // Stop at empty line or next section header
                break;
            }
            sectionLines.push(line);
        }
    }
    
    return sectionLines.join('\n').trim() || `Information about ${keywords[0].toLowerCase()} not specified in policy document.`;
}

// ============================================================================
// DATA INSERTION FUNCTIONS
// ============================================================================

async function insertDemoPolicies() {
    console.log('🏥 Inserting Demo Policy Records...\n');
    
    try {
        // Check if collection exists and is loaded
        const hasCollection = await client.hasCollection({
            collection_name: 'insurance_policies'
        });
        
        if (!hasCollection.value) {
            console.error('❌ insurance_policies collection does not exist!');
            console.log('Run: npm run setup-db first');
            return;
        }
        
        const insertData = [];
        
        for (let i = 0; i < DEMO_POLICIES.length; i++) {
            const policy = DEMO_POLICIES[i];
            console.log(`📄 Processing ${policy.company_name} policy for ${policy.email}...`);
            
            // Extract different sections from policy document
            const pricingText = extractPolicySection(policy.policy_document, 'pricing');
            const coveredText = extractPolicySection(policy.policy_document, 'covered');
            const excludedText = extractPolicySection(policy.policy_document, 'excluded');
            const hospitalsText = extractPolicySection(policy.policy_document, 'hospitals');
            
            console.log(`  🔄 Generating embeddings...`);
            
            // Generate embeddings for each section
            const [pricingEmb, coveredEmb, excludedEmb, hospitalsEmb] = await Promise.all([
                generateEmbedding(pricingText),
                generateEmbedding(coveredText),
                generateEmbedding(excludedText),
                generateEmbedding(hospitalsText)
            ]);
            
            // Create record for insertion
            const policyRecord = {
                id: `policy_${policy.email}_${Date.now()}_${i}`,
                email: policy.email,
                company_name: policy.company_name,
                policy_name: policy.policy_name,
                purchase_year: policy.purchase_year,
                sum_insured: policy.sum_insured,
                is_active: policy.is_active,
                pricing_embedding: pricingEmb,
                covered_conditions_embedding: coveredEmb,
                excluded_conditions_embedding: excludedEmb,
                network_hospitals_embedding: hospitalsEmb,
                policy_text: policy.policy_document.trim(),
                created_at: Date.now()
            };
            
            insertData.push(policyRecord);
            console.log(`  ✅ Prepared ${policy.company_name} ${policy.policy_name}`);
        }
        
        // Insert all records at once
        console.log('\n💾 Inserting records into Zilliz...');
        await client.insert({
            collection_name: 'insurance_policies',
            data: insertData
        });
        
        console.log('✅ All demo policies inserted successfully!');
        
        // Show updated collection stats
        console.log('\n📊 Updated Collection Statistics:');
        const stats = await client.getCollectionStatistics({
            collection_name: 'insurance_policies'
        });
        console.log(`insurance_policies: ${stats.stats.row_count} records`);
        
        // Show inserted records summary
        console.log('\n📋 Inserted Policy Records:');
        insertData.forEach((record, index) => {
            const status = record.is_active ? '✅ ACTIVE' : '❌ EXPIRED';
            const sumInsured = `₹${record.sum_insured.toLocaleString('en-IN')}`;
            console.log(`${index + 1}. ${record.email} - ${record.company_name} ${record.policy_name} (${record.purchase_year}) - ${sumInsured} - ${status}`);
        });
        
    } catch (error) {
        console.error('❌ Failed to insert demo policies:', error.message);
        throw error;
    }
}

async function searchPolicyByEmail(email) {
    console.log(`🔍 Searching policies for ${email}...`);
    
    try {
        const searchResults = await client.search({
            collection_name: 'insurance_policies',
            vectors: [Array(768).fill(0)], // Dummy vector for filter search
            search_params: {
                anns_field: 'pricing_embedding',
                topk: 10,
                metric_type: 'COSINE',
                params: { ef: 64 }
            },
            filter: `email == "${email}"`,
            output_fields: ['email', 'company_name', 'policy_name', 'purchase_year']
        });
        
        if (searchResults[0] && searchResults[0].length > 0) {
            console.log('\n📋 Found Policies:');
            searchResults[0].forEach((result, index) => {
                console.log(`${index + 1}. ${result.company_name} ${result.policy_name} (${result.purchase_year})`);
            });
        } else {
            console.log('No policies found for this email.');
        }
        
        return searchResults[0] || [];
    } catch (error) {
        console.error('Search failed:', error.message);
        return [];
    }
}

async function viewAllPolicies() {
    console.log('📋 All Insurance Policies in Database:\n');
    
    try {
        const queryResults = await client.query({
            collection_name: 'insurance_policies',
            filter: 'purchase_year > 2000',
            output_fields: ['email', 'company_name', 'policy_name', 'purchase_year'],
            limit: 20
        });
        
        if (queryResults.length > 0) {
            queryResults.forEach((record, index) => {
                console.log(`${index + 1}. ${record.email}`);
                console.log(`   Company: ${record.company_name}`);
                console.log(`   Policy: ${record.policy_name}`);
                console.log(`   Year: ${record.purchase_year}`);
                console.log('');
            });
        } else {
            console.log('No policies found in database.');
        }
        
    } catch (error) {
        console.error('Failed to retrieve policies:', error.message);
    }
}

// ============================================================================
// COMMAND LINE INTERFACE
// ============================================================================

async function main() {
    const command = process.argv[2] || 'insert';
    const email = process.argv[3];
    
    console.log('🏥 Demo Policy Data Manager\n');
    
    try {
        switch (command) {
            case 'insert':
                await insertDemoPolicies();
                break;
            case 'search':
                if (!email) {
                    console.log('Usage: node insert-demo-policies.js search <email>');
                    return;
                }
                await searchPolicyByEmail(email);
                break;
            case 'view':
                await viewAllPolicies();
                break;
            default:
                console.log('Usage:');
                console.log('  node insert-demo-policies.js insert              - Insert demo policies');
                console.log('  node insert-demo-policies.js search <email>      - Search policies by email');
                console.log('  node insert-demo-policies.js view                - View all policies');
        }
    } catch (error) {
        console.error('❌ Operation failed:', error.message);
        
        if (error.message.includes('collection')) {
            console.log('\n🔧 Try running: npm run setup-db first');
        }
        
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    insertDemoPolicies,
    searchPolicyByEmail,
    viewAllPolicies,
    DEMO_POLICIES
};
