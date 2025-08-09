#!/usr/bin/env node
/**
 * Alchemy API Analysis Runner for BASE Network
 * Execute comprehensive endpoint testing against your BASE node
 */

const AlchemyEndpointAnalyzer = require('./alchemy-endpoint-analyzer');

async function runAnalysis() {
    console.log('🚀 STARTING ALCHEMY API ENDPOINT ANALYSIS');
    console.log('==========================================');
    console.log('📍 TARGET: BASE Network via local node');
    console.log('🎯 PURPOSE: Identify available Alchemy endpoints');
    console.log('');

    try {
        // Configuration
        const config = {
            baseNodeEndpoint: process.env.BASE_RPC_URL || 'http://localhost:8545',
            timeout: 15000, // 15 second timeout for thorough testing
            // alchemyEndpoint: process.env.ALCHEMY_BASE_URL, // Optional: for comparison
        };

        console.log(`📡 Testing endpoint: ${config.baseNodeEndpoint}`);
        console.log('⏱️  Timeout per request: 15 seconds');
        console.log('🔄 Starting comprehensive analysis...\n');

        // Initialize analyzer
        const analyzer = new AlchemyEndpointAnalyzer(config);

        // Run full analysis
        await analyzer.analyzeAllEndpoints();

        // Export results
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const filename = `alchemy-analysis-${timestamp}.json`;
        const results = analyzer.exportResults(filename);

        // Display key findings
        console.log('\n🎯 KEY FINDINGS FOR BASE NETWORK:');
        console.log('=================================');
        
        const supportedMethods = analyzer.getSupportedMethods();
        console.log(`\n✅ TOP SUPPORTED METHODS (by response time):`);
        supportedMethods.slice(0, 10).forEach((method, index) => {
            console.log(`   ${index + 1}. ${method.method} (${method.responseTime}ms) [${method.category}]`);
        });

        // Critical trading methods check
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

        console.log('\n🏪 CRITICAL TRADING METHODS STATUS:');
        console.log('===================================');
        
        criticalMethods.forEach(method => {
            const result = analyzer.testResults.standard?.[method];
            const status = result?.supported ? '✅ SUPPORTED' : '❌ NOT SUPPORTED';
            const timing = result?.responseTime ? ` (${result.responseTime}ms)` : '';
            console.log(`   ${method}: ${status}${timing}`);
        });

        // Enhanced features check
        const enhancedFeatures = [
            'alchemy_getTokenBalances',
            'alchemy_getTokenMetadata', 
            'alchemy_getAssetTransfers',
            'alchemy_getNFTs',
            'debug_traceTransaction',
            'trace_transaction'
        ];

        console.log('\n🚀 ENHANCED FEATURES STATUS:');
        console.log('============================');
        
        enhancedFeatures.forEach(method => {
            const result = analyzer.testResults.enhanced?.[method] || analyzer.testResults.layer2?.[method];
            const status = result?.supported ? '✅ AVAILABLE' : '❌ NOT AVAILABLE';
            const timing = result?.responseTime ? ` (${result.responseTime}ms)` : '';
            console.log(`   ${method}: ${status}${timing}`);
        });

        // Performance summary
        const avgResponseTime = supportedMethods.length > 0 
            ? (supportedMethods.reduce((sum, m) => sum + m.responseTime, 0) / supportedMethods.length).toFixed(1)
            : 0;

        console.log('\n📊 PERFORMANCE SUMMARY:');
        console.log('=======================');
        console.log(`   Average response time: ${avgResponseTime}ms`);
        console.log(`   Fastest method: ${supportedMethods[0]?.method} (${supportedMethods[0]?.responseTime}ms)`);
        console.log(`   Total methods tested: ${analyzer.testResults.summary.total}`);
        console.log(`   Support rate: ${results.summary.supportRate}`);

        // Trading suitability assessment
        console.log('\n🎯 TRADING SUITABILITY ASSESSMENT:');
        console.log('==================================');
        
        const criticalSupported = criticalMethods.filter(method => 
            analyzer.testResults.standard?.[method]?.supported
        ).length;
        
        const criticalSupportRate = (criticalSupported / criticalMethods.length) * 100;
        
        if (criticalSupportRate >= 90) {
            console.log('🟢 EXCELLENT: Fully suitable for high-frequency trading');
            console.log('   ✅ All critical methods supported');
            console.log('   ✅ Fast response times');
            console.log('   ✅ Ready for production trading');
        } else if (criticalSupportRate >= 70) {
            console.log('🟡 GOOD: Suitable for basic trading with limitations');
            console.log('   ⚠️  Some critical methods missing');
            console.log('   ✅ Core functionality available');
        } else {
            console.log('🔴 LIMITED: Basic functionality only');
            console.log('   ❌ Multiple critical methods missing');
            console.log('   ⚠️  Not recommended for advanced trading');
        }

        console.log('\n💡 NEXT STEPS:');
        console.log('==============');
        console.log('1. Review exported analysis file for detailed results');
        console.log('2. Test specific methods critical to your trading strategy');
        console.log('3. Implement error handling for unsupported methods');
        console.log('4. Consider Alchemy Pro endpoints for enhanced features');
        console.log(`5. Optimize for methods with <${avgResponseTime}ms response time`);

        console.log('\n✅ ANALYSIS COMPLETE!');
        console.log(`📄 Detailed results saved to: ${filename}`);

    } catch (error) {
        console.error('\n❌ ANALYSIS FAILED:', error.message);
        console.error('🔧 Possible issues:');
        console.error('   - BASE node not running or accessible');
        console.error('   - Network connectivity problems');
        console.error('   - RPC endpoint configuration incorrect');
        console.error('   - Insufficient permissions or rate limiting');
        
        process.exit(1);
    }
}

// Handle command line execution
if (require.main === module) {
    runAnalysis().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { runAnalysis };