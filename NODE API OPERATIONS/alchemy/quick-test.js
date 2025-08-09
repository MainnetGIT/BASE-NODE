#!/usr/bin/env node
/**
 * Quick Alchemy API Test for BASE Network
 * Fast verification of key endpoints
 */

const AlchemyEndpointAnalyzer = require('./alchemy-endpoint-analyzer');

async function quickTest() {
    console.log('⚡ QUICK ALCHEMY API TEST FOR BASE NETWORK');
    console.log('==========================================');
    
    try {
        const analyzer = new AlchemyEndpointAnalyzer({
            baseNodeEndpoint: 'http://localhost:8545',
            timeout: 5000
        });

        console.log('🔍 Testing critical trading methods...\n');

        // Test critical methods only
        const criticalMethods = [
            'eth_blockNumber',
            'eth_getBalance', 
            'eth_getTransactionCount',
            'eth_sendRawTransaction',
            'eth_getLogs',
            'eth_getBlockByNumber',
            'eth_getTransactionReceipt',
            'eth_gasPrice',
            'eth_estimateGas',
            'eth_call'
        ];

        const results = {};
        
        for (const method of criticalMethods) {
            try {
                console.log(`Testing ${method}...`);
                const result = await analyzer.testSingleEndpoint(method);
                results[method] = result;
            } catch (error) {
                console.log(`❌ ${method}: ${error.message}`);
                results[method] = { supported: false, error: error.message };
            }
        }

        console.log('\n📊 QUICK TEST RESULTS:');
        console.log('======================');
        
        let supported = 0;
        for (const [method, result] of Object.entries(results)) {
            const status = result.supported ? '✅' : '❌';
            const timing = result.responseTime ? ` (${result.responseTime}ms)` : '';
            console.log(`${status} ${method}${timing}`);
            if (result.supported) supported++;
        }

        const supportRate = ((supported / criticalMethods.length) * 100).toFixed(1);
        console.log(`\n📈 Critical Methods Support: ${supported}/${criticalMethods.length} (${supportRate}%)`);

        if (supportRate >= 90) {
            console.log('🟢 EXCELLENT: Ready for production trading!');
        } else if (supportRate >= 70) {
            console.log('🟡 GOOD: Suitable for basic trading operations');
        } else {
            console.log('🔴 LIMITED: Check node configuration');
        }

        console.log('\n💡 Run full analysis with: node run-analysis.js');

    } catch (error) {
        console.error('❌ Quick test failed:', error.message);
    }
}

if (require.main === module) {
    quickTest();
}

module.exports = { quickTest };