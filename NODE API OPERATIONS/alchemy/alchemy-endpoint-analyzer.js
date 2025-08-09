/**
 * Alchemy API Endpoint Analyzer for BASE Network
 * Tests and documents available Alchemy endpoints through node RPC
 */

const BaseRPCClient = require('../rpc/base-rpc-client');

class AlchemyEndpointAnalyzer {
    constructor(config = {}) {
        this.config = {
            baseNodeEndpoint: config.baseNodeEndpoint || 'http://localhost:8545',
            alchemyEndpoint: config.alchemyEndpoint || null, // Optional Alchemy endpoint for comparison
            timeout: config.timeout || 10000,
            ...config
        };

        this.baseRPC = new BaseRPCClient({ 
            endpoint: this.config.baseNodeEndpoint,
            timeout: this.config.timeout 
        });

        this.alchemyRPC = this.config.alchemyEndpoint 
            ? new BaseRPCClient({ 
                endpoint: this.config.alchemyEndpoint,
                timeout: this.config.timeout 
              })
            : null;

        // Comprehensive list of Alchemy API methods
        this.alchemyEndpoints = {
            // Standard Ethereum JSON-RPC methods
            standard: [
                'eth_blockNumber',
                'eth_getBalance',
                'eth_getStorageAt',
                'eth_getTransactionCount',
                'eth_getBlockTransactionCountByHash',
                'eth_getBlockTransactionCountByNumber',
                'eth_getUncleCountByBlockHash',
                'eth_getUncleCountByBlockNumber',
                'eth_getCode',
                'eth_sign',
                'eth_signTransaction',
                'eth_sendTransaction',
                'eth_sendRawTransaction',
                'eth_call',
                'eth_estimateGas',
                'eth_getBlockByHash',
                'eth_getBlockByNumber',
                'eth_getTransactionByHash',
                'eth_getTransactionByBlockHashAndIndex',
                'eth_getTransactionByBlockNumberAndIndex',
                'eth_getTransactionReceipt',
                'eth_getUncleByBlockHashAndIndex',
                'eth_getUncleByBlockNumberAndIndex',
                'eth_getCompilers',
                'eth_compileLLL',
                'eth_compileSolidity',
                'eth_compileSerpent',
                'eth_newFilter',
                'eth_newBlockFilter',
                'eth_newPendingTransactionFilter',
                'eth_uninstallFilter',
                'eth_getFilterChanges',
                'eth_getFilterLogs',
                'eth_getLogs',
                'eth_getWork',
                'eth_submitWork',
                'eth_submitHashrate',
                'eth_gasPrice',
                'eth_accounts',
                'eth_coinbase',
                'eth_mining',
                'eth_hashrate',
                'eth_syncing',
                'eth_protocolVersion',
                'net_version',
                'net_peerCount',
                'net_listening',
                'web3_clientVersion',
                'web3_sha3'
            ],

            // Alchemy Enhanced APIs
            enhanced: [
                // NFT API
                'alchemy_getNFTs',
                'alchemy_getNFTsForCollection',
                'alchemy_getNFTMetadata',
                'alchemy_getContractMetadata',
                'alchemy_getOwnersForToken',
                'alchemy_getOwnersForCollection',
                'alchemy_isHolderOfCollection',
                'alchemy_getSpamContracts',
                'alchemy_isSpamContract',
                'alchemy_getFloorPrice',
                'alchemy_getNFTSales',
                'alchemy_computeRarity',
                'alchemy_searchContractMetadata',
                'alchemy_summarizeNFTAttributes',
                'alchemy_refreshNFTMetadata',
                'alchemy_getNFTsForOwner',
                'alchemy_getOwnersForNFT',
                'alchemy_validateNFTOwnership',

                // Token API
                'alchemy_getTokenBalances',
                'alchemy_getTokenMetadata',
                'alchemy_getTokenAllowance',
                'alchemy_getAssetTransfers',

                // Webhook API
                'alchemy_getWebhooks',
                'alchemy_createWebhook',
                'alchemy_updateWebhook',
                'alchemy_deleteWebhook',

                // Notify API
                'alchemy_getAddresses',
                'alchemy_addAddresses',
                'alchemy_removeAddresses',

                // Transact API
                'alchemy_sendPrivateTransaction',
                'alchemy_cancelPrivateTransaction',

                // Debug/Trace API
                'alchemy_getTransactionReceipts',
                'debug_traceTransaction',
                'debug_traceCall',
                'debug_traceBlockByNumber',
                'debug_traceBlockByHash',
                'trace_call',
                'trace_callMany',
                'trace_rawTransaction',
                'trace_replayBlockTransactions',
                'trace_replayTransaction',
                'trace_block',
                'trace_filter',
                'trace_get',
                'trace_transaction'
            ],

            // Subscription methods (WebSocket)
            subscriptions: [
                'eth_subscribe',
                'eth_unsubscribe',
                'alchemy_subscribe',
                'alchemy_unsubscribe'
            ],

            // BASE-specific or L2-specific methods
            layer2: [
                'eth_getProof',
                'eth_createAccessList',
                'eth_feeHistory',
                'eth_maxPriorityFeePerGas',
                'rollup_getInfo',
                'opp_version',
                'opp_syncStatus'
            ]
        };

        this.testResults = {
            standard: {},
            enhanced: {},
            subscriptions: {},
            layer2: {},
            summary: {
                total: 0,
                supported: 0,
                unsupported: 0,
                errors: 0
            }
        };
    }

    /**
     * Test all Alchemy endpoints against BASE node
     */
    async analyzeAllEndpoints() {
        console.log('🔍 ALCHEMY API ENDPOINT ANALYSIS FOR BASE NETWORK');
        console.log('==================================================');
        console.log(`📡 Testing against: ${this.config.baseNodeEndpoint}`);
        console.log('');

        const startTime = Date.now();

        try {
            // Test standard endpoints
            console.log('📊 Testing Standard Ethereum JSON-RPC Methods...');
            await this.testEndpointCategory('standard');

            // Test enhanced Alchemy APIs
            console.log('\n🚀 Testing Enhanced Alchemy APIs...');
            await this.testEndpointCategory('enhanced');

            // Test subscription methods
            console.log('\n📡 Testing Subscription Methods...');
            await this.testEndpointCategory('subscriptions');

            // Test Layer 2 specific methods
            console.log('\n🌐 Testing Layer 2 / BASE Specific Methods...');
            await this.testEndpointCategory('layer2');

            const totalTime = Date.now() - startTime;
            this.generateSummaryReport(totalTime);

        } catch (error) {
            console.error('❌ Analysis failed:', error.message);
            throw error;
        }
    }

    /**
     * Test a specific category of endpoints
     */
    async testEndpointCategory(category) {
        const endpoints = this.alchemyEndpoints[category];
        const results = {};

        for (const method of endpoints) {
            try {
                console.log(`   Testing ${method}...`);
                const result = await this.testSingleEndpoint(method);
                results[method] = result;
                
                // Update summary
                this.testResults.summary.total++;
                if (result.supported) {
                    this.testResults.summary.supported++;
                } else if (result.error) {
                    this.testResults.summary.errors++;
                } else {
                    this.testResults.summary.unsupported++;
                }

                // Small delay to avoid overwhelming the node
                await this.delay(100);

            } catch (error) {
                console.log(`   ❌ ${method}: ${error.message}`);
                results[method] = {
                    supported: false,
                    error: error.message,
                    category: category
                };
                this.testResults.summary.total++;
                this.testResults.summary.errors++;
            }
        }

        this.testResults[category] = results;
    }

    /**
     * Test a single endpoint with appropriate parameters
     */
    async testSingleEndpoint(method) {
        const testParams = this.getTestParameters(method);
        const startTime = Date.now();

        try {
            const result = await this.baseRPC.call(method, testParams.params);
            const responseTime = Date.now() - startTime;

            // Check if the response indicates the method is supported
            const supported = this.isMethodSupported(method, result);

            console.log(`   ${supported ? '✅' : '❌'} ${method}: ${supported ? 'Supported' : 'Not supported'} (${responseTime}ms)`);

            return {
                supported,
                responseTime,
                testParams: testParams.params,
                response: this.sanitizeResponse(result),
                category: this.getCategoryForMethod(method)
            };

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            // Some errors indicate the method exists but needs different parameters
            const supported = this.isMethodSupportedFromError(error);
            
            console.log(`   ${supported ? '⚠️' : '❌'} ${method}: ${supported ? 'Exists (parameter error)' : error.message} (${responseTime}ms)`);

            return {
                supported,
                responseTime,
                testParams: testParams.params,
                error: error.message,
                category: this.getCategoryForMethod(method)
            };
        }
    }

    /**
     * Get appropriate test parameters for each method
     */
    getTestParameters(method) {
        const paramMap = {
            // Standard methods with known parameters
            'eth_getBalance': { params: ['0x0000000000000000000000000000000000000000', 'latest'] },
            'eth_getBlockByNumber': { params: ['latest', false] },
            'eth_getTransactionCount': { params: ['0x0000000000000000000000000000000000000000', 'latest'] },
            'eth_call': { params: [{ to: '0x0000000000000000000000000000000000000000', data: '0x' }, 'latest'] },
            'eth_estimateGas': { params: [{ to: '0x0000000000000000000000000000000000000000' }] },
            'eth_getLogs': { params: [{ fromBlock: 'latest', toBlock: 'latest' }] },
            'eth_getStorageAt': { params: ['0x0000000000000000000000000000000000000000', '0x0', 'latest'] },
            'eth_getCode': { params: ['0x0000000000000000000000000000000000000000', 'latest'] },

            // Enhanced Alchemy methods
            'alchemy_getTokenBalances': { params: ['0x0000000000000000000000000000000000000000'] },
            'alchemy_getTokenMetadata': { params: ['0x0000000000000000000000000000000000000000'] },
            'alchemy_getAssetTransfers': { params: [{ fromBlock: '0x0', category: ['external'] }] },
            'alchemy_getNFTs': { params: ['0x0000000000000000000000000000000000000000'] },
            'alchemy_getNFTMetadata': { params: ['0x0000000000000000000000000000000000000000', '1'] },

            // Debug/Trace methods
            'debug_traceTransaction': { params: ['0x0000000000000000000000000000000000000000000000000000000000000000'] },
            'trace_transaction': { params: ['0x0000000000000000000000000000000000000000000000000000000000000000'] },

            // Subscription methods
            'eth_subscribe': { params: ['newHeads'] },
            'alchemy_subscribe': { params: ['newHeads'] },

            // Layer 2 methods
            'eth_feeHistory': { params: [4, 'latest', [25, 50, 75]] },
            'eth_createAccessList': { params: [{ to: '0x0000000000000000000000000000000000000000' }, 'latest'] }
        };

        return paramMap[method] || { params: [] };
    }

    /**
     * Determine if a method is supported based on the response
     */
    isMethodSupported(method, result) {
        // If we got any result (not null/undefined), the method likely exists
        return result !== null && result !== undefined;
    }

    /**
     * Determine if a method is supported based on error message
     */
    isMethodSupportedFromError(error) {
        const errorMessage = error.message.toLowerCase();
        
        // These errors suggest the method exists but needs correct parameters
        const supportedErrorPatterns = [
            'invalid params',
            'missing required field',
            'invalid argument',
            'execution reverted',
            'insufficient funds',
            'invalid address',
            'invalid block number'
        ];

        // These errors suggest the method doesn't exist
        const unsupportedErrorPatterns = [
            'method not found',
            'the method does not exist',
            'unknown method',
            'method not supported',
            'not implemented'
        ];

        for (const pattern of unsupportedErrorPatterns) {
            if (errorMessage.includes(pattern)) {
                return false;
            }
        }

        for (const pattern of supportedErrorPatterns) {
            if (errorMessage.includes(pattern)) {
                return true;
            }
        }

        // Default to unsupported for unknown errors
        return false;
    }

    /**
     * Get category for a method
     */
    getCategoryForMethod(method) {
        for (const [category, methods] of Object.entries(this.alchemyEndpoints)) {
            if (methods.includes(method)) {
                return category;
            }
        }
        return 'unknown';
    }

    /**
     * Sanitize response for logging
     */
    sanitizeResponse(response) {
        if (typeof response === 'string' && response.length > 100) {
            return response.substring(0, 100) + '...';
        }
        return response;
    }

    /**
     * Generate comprehensive summary report
     */
    generateSummaryReport(totalTime) {
        console.log('\n📊 ALCHEMY ENDPOINT ANALYSIS SUMMARY');
        console.log('=====================================');
        console.log(`⏱️  Total analysis time: ${totalTime}ms`);
        console.log(`📈 Total methods tested: ${this.testResults.summary.total}`);
        console.log(`✅ Supported methods: ${this.testResults.summary.supported}`);
        console.log(`❌ Unsupported methods: ${this.testResults.summary.unsupported}`);
        console.log(`⚠️  Error responses: ${this.testResults.summary.errors}`);
        
        const supportRate = ((this.testResults.summary.supported / this.testResults.summary.total) * 100).toFixed(1);
        console.log(`📊 Support rate: ${supportRate}%`);

        // Category breakdown
        console.log('\n📋 CATEGORY BREAKDOWN:');
        console.log('======================');
        
        for (const [category, results] of Object.entries(this.testResults)) {
            if (category === 'summary') continue;
            
            const categoryMethods = Object.keys(results);
            const supportedInCategory = categoryMethods.filter(method => results[method].supported).length;
            const supportRateCategory = categoryMethods.length > 0 
                ? ((supportedInCategory / categoryMethods.length) * 100).toFixed(1)
                : 0;
            
            console.log(`\n🏷️  ${category.toUpperCase()}:`);
            console.log(`   Total: ${categoryMethods.length}`);
            console.log(`   Supported: ${supportedInCategory} (${supportRateCategory}%)`);
            
            // List supported methods
            const supported = categoryMethods.filter(method => results[method].supported);
            if (supported.length > 0) {
                console.log(`   ✅ Supported: ${supported.join(', ')}`);
            }
            
            // List unsupported methods
            const unsupported = categoryMethods.filter(method => !results[method].supported);
            if (unsupported.length > 0 && unsupported.length <= 10) {
                console.log(`   ❌ Unsupported: ${unsupported.join(', ')}`);
            } else if (unsupported.length > 10) {
                console.log(`   ❌ Unsupported: ${unsupported.slice(0, 10).join(', ')} ... and ${unsupported.length - 10} more`);
            }
        }

        // Recommendations
        console.log('\n💡 RECOMMENDATIONS:');
        console.log('===================');
        
        const standardSupported = Object.keys(this.testResults.standard || {}).filter(
            method => this.testResults.standard[method].supported
        ).length;
        const standardTotal = Object.keys(this.testResults.standard || {}).length;
        
        if (standardSupported / standardTotal > 0.8) {
            console.log('✅ Excellent standard JSON-RPC support - suitable for basic trading operations');
        }
        
        const enhancedSupported = Object.keys(this.testResults.enhanced || {}).filter(
            method => this.testResults.enhanced[method].supported
        ).length;
        
        if (enhancedSupported > 0) {
            console.log('🚀 Some enhanced Alchemy features available - check specific methods for advanced functionality');
        } else {
            console.log('⚠️  No enhanced Alchemy features detected - use standard JSON-RPC methods only');
        }

        console.log('\n📋 USAGE RECOMMENDATIONS:');
        console.log('=========================');
        console.log('1. Use standard eth_* methods for basic blockchain operations');
        console.log('2. Test specific alchemy_* methods before using in production');
        console.log('3. Implement fallback logic for unsupported enhanced features');
        console.log('4. Monitor response times for performance optimization');
    }

    /**
     * Export results to JSON file
     */
    exportResults(filename = 'alchemy-endpoint-analysis.json') {
        const exportData = {
            timestamp: new Date().toISOString(),
            config: this.config,
            results: this.testResults,
            summary: {
                totalMethods: this.testResults.summary.total,
                supportedMethods: this.testResults.summary.supported,
                supportRate: ((this.testResults.summary.supported / this.testResults.summary.total) * 100).toFixed(1) + '%'
            }
        };

        require('fs').writeFileSync(filename, JSON.stringify(exportData, null, 2));
        console.log(`\n💾 Results exported to: ${filename}`);
        
        return exportData;
    }

    /**
     * Get supported methods list
     */
    getSupportedMethods() {
        const supported = [];
        
        for (const [category, results] of Object.entries(this.testResults)) {
            if (category === 'summary') continue;
            
            for (const [method, result] of Object.entries(results)) {
                if (result.supported) {
                    supported.push({
                        method,
                        category,
                        responseTime: result.responseTime
                    });
                }
            }
        }
        
        return supported.sort((a, b) => a.responseTime - b.responseTime);
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = AlchemyEndpointAnalyzer;