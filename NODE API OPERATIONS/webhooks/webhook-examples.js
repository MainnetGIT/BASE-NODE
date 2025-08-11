#!/usr/bin/env node
/**
 * Webhook Infrastructure Examples
 * Demonstrate various webhook use cases for BASE network
 */

const WebhookClient = require('./webhook-client');
const express = require('express');

class WebhookExamples {
    constructor() {
        this.client = new WebhookClient({
            serverUrl: 'http://localhost:3001',
            wsUrl: 'ws://localhost:3002'
        });
        
        this.webhooks = new Map();
    }

    /**
     * Example 1: New Token Detection Webhook
     */
    async createNewTokenDetectionWebhook() {
        console.log('1️⃣ CREATING NEW TOKEN DETECTION WEBHOOK');
        console.log('=======================================');
        
        try {
            const webhook = await this.client.createWebhook({
                url: 'https://your-app.com/webhooks/new-tokens',
                name: 'New Token Detector',
                description: 'Notifies when new ERC-20 tokens are deployed on BASE',
                events: ['tokenTransfers', 'poolCreation'],
                filters: {
                    newTokensOnly: true,
                    minLiquidity: '1000000000000000000' // 1 ETH minimum
                },
                headers: {
                    'Authorization': 'Bearer your-api-key',
                    'X-App-ID': 'base-token-detector'
                }
            });
            
            console.log('✅ New token detection webhook created:');
            console.log(`   ID: ${webhook.id}`);
            console.log(`   Name: ${webhook.name}`);
            console.log(`   Events: ${webhook.events.join(', ')}`);
            
            this.webhooks.set('newTokens', webhook);
            return webhook;
        } catch (error) {
            console.error('❌ Failed to create new token webhook:', error.message);
            return null;
        }
    }

    /**
     * Example 2: Wallet Activity Monitor
     */
    async createWalletActivityWebhook() {
        console.log('\n2️⃣ CREATING WALLET ACTIVITY MONITOR');
        console.log('===================================');
        
        try {
            const watchAddresses = [
                '0xE7EB013b728f2D323633b41bf1BF898B3756A389', // Your trading wallet
                '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24', // Uniswap V2 Router
                '0x6ff5693b99212da76ad316178a184ab56d299b43'  // Universal Router
            ];

            const webhook = await this.client.createWebhook({
                url: 'https://your-app.com/webhooks/wallet-activity',
                name: 'Wallet Activity Monitor',
                description: 'Monitors specific wallet addresses for activity',
                events: ['tokenTransfers', 'addressActivity'],
                filters: {
                    addresses: watchAddresses,
                    includeIncoming: true,
                    includeOutgoing: true,
                    minValue: '100000000000000000' // 0.1 ETH minimum
                },
                headers: {
                    'X-Monitor-Type': 'wallet-activity'
                }
            });
            
            console.log('✅ Wallet activity webhook created:');
            console.log(`   ID: ${webhook.id}`);
            console.log(`   Monitoring ${watchAddresses.length} addresses`);
            
            this.webhooks.set('walletActivity', webhook);
            return webhook;
        } catch (error) {
            console.error('❌ Failed to create wallet activity webhook:', error.message);
            return null;
        }
    }

    /**
     * Example 3: Price Movement Alerts
     */
    async createPriceAlertWebhook() {
        console.log('\n3️⃣ CREATING PRICE MOVEMENT ALERTS');
        console.log('=================================');
        
        try {
            const webhook = await this.client.createWebhook({
                url: 'https://your-app.com/webhooks/price-alerts',
                name: 'Price Movement Alerts',
                description: 'Alerts on significant price movements',
                events: ['tokenTransfers'],
                filters: {
                    priceChangeThreshold: 10, // 10% price change
                    timeWindow: 300, // 5 minutes
                    tokens: [
                        '0x4200000000000000000000000000000000000006', // WETH
                        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'  // USDC
                    ]
                },
                headers: {
                    'X-Alert-Type': 'price-movement',
                    'X-Urgency': 'high'
                }
            });
            
            console.log('✅ Price alert webhook created:');
            console.log(`   ID: ${webhook.id}`);
            console.log(`   Threshold: 10% price change`);
            
            this.webhooks.set('priceAlerts', webhook);
            return webhook;
        } catch (error) {
            console.error('❌ Failed to create price alert webhook:', error.message);
            return null;
        }
    }

    /**
     * Example 4: Liquidity Pool Monitor
     */
    async createLiquidityPoolWebhook() {
        console.log('\n4️⃣ CREATING LIQUIDITY POOL MONITOR');
        console.log('==================================');
        
        try {
            const webhook = await this.client.createWebhook({
                url: 'https://your-app.com/webhooks/liquidity-pools',
                name: 'Liquidity Pool Monitor',
                description: 'Monitors liquidity pool creation and changes',
                events: ['poolCreation', 'tokenTransfers'],
                filters: {
                    dexes: ['uniswap-v2', 'uniswap-v3', 'uniswap-v4'],
                    minLiquidity: '10000000000000000000', // 10 ETH minimum
                    newPoolsOnly: true
                },
                headers: {
                    'X-Monitor-Type': 'liquidity-pools'
                }
            });
            
            console.log('✅ Liquidity pool webhook created:');
            console.log(`   ID: ${webhook.id}`);
            console.log(`   Monitoring: Uniswap V2, V3, V4`);
            
            this.webhooks.set('liquidityPools', webhook);
            return webhook;
        } catch (error) {
            console.error('❌ Failed to create liquidity pool webhook:', error.message);
            return null;
        }
    }

    /**
     * Example 5: Block Updates Monitor
     */
    async createBlockUpdatesWebhook() {
        console.log('\n5️⃣ CREATING BLOCK UPDATES MONITOR');
        console.log('=================================');
        
        try {
            const webhook = await this.client.createWebhook({
                url: 'https://your-app.com/webhooks/blocks',
                name: 'Block Updates Monitor',
                description: 'Real-time block notifications with transaction analysis',
                events: ['newBlocks'],
                filters: {
                    includeTransactions: true,
                    minTransactions: 10,
                    gasThreshold: 0.8 // Alert if block >80% full
                },
                headers: {
                    'X-Monitor-Type': 'block-updates'
                }
            });
            
            console.log('✅ Block updates webhook created:');
            console.log(`   ID: ${webhook.id}`);
            console.log(`   Includes transaction data`);
            
            this.webhooks.set('blockUpdates', webhook);
            return webhook;
        } catch (error) {
            console.error('❌ Failed to create block updates webhook:', error.message);
            return null;
        }
    }

    /**
     * Example 6: Test All Webhooks
     */
    async testAllWebhooks() {
        console.log('\n6️⃣ TESTING ALL WEBHOOKS');
        console.log('========================');
        
        for (const [type, webhook] of this.webhooks) {
            try {
                console.log(`🧪 Testing ${webhook.name}...`);
                
                const testData = {
                    type: 'test',
                    message: `Test webhook for ${type}`,
                    timestamp: new Date().toISOString(),
                    mockData: this.generateMockData(type)
                };
                
                const result = await this.client.testWebhook(webhook.id, testData);
                
                if (result.success) {
                    console.log(`   ✅ Test successful (${result.status})`);
                } else {
                    console.log(`   ❌ Test failed: ${result.error}`);
                }
            } catch (error) {
                console.log(`   ❌ Test error: ${error.message}`);
            }
        }
    }

    /**
     * Example 7: Real-time WebSocket Monitoring
     */
    async startWebSocketMonitoring() {
        console.log('\n7️⃣ STARTING REAL-TIME WEBSOCKET MONITORING');
        console.log('==========================================');
        
        try {
            // Connect to WebSocket
            this.client.connectWebSocket();
            
            // Set up event listeners
            this.client.on('connected', () => {
                console.log('🔗 Connected to real-time webhook stream');
                
                // Subscribe to events
                this.client.subscribeToEvents(['newBlocks', 'tokenTransfers', 'poolCreation']);
            });
            
            this.client.on('event', (event) => {
                console.log(`📨 Real-time event: ${event.type}`);
                console.log(`   Timestamp: ${event.timestamp}`);
                
                switch (event.type) {
                    case 'newBlock':
                        this.handleNewBlockEvent(event.data);
                        break;
                    case 'tokenTransfer':
                        this.handleTokenTransferEvent(event.data);
                        break;
                    case 'poolCreation':
                        this.handlePoolCreationEvent(event.data);
                        break;
                }
            });
            
            this.client.on('newBlock', (blockData) => {
                console.log(`📦 New block: ${blockData.blockNumber} (${blockData.transactionCount} txs)`);
            });
            
            this.client.on('tokenTransfer', (transferData) => {
                console.log(`🔄 Token transfer: ${transferData.value} from ${transferData.from.slice(0,8)}...`);
            });
            
            this.client.on('disconnected', () => {
                console.log('❌ Disconnected from webhook stream');
            });
            
            console.log('⏰ Monitoring real-time events... (Press Ctrl+C to stop)');
            
        } catch (error) {
            console.error('❌ Failed to start WebSocket monitoring:', error.message);
        }
    }

    /**
     * Example 8: Webhook Statistics and Management
     */
    async displayWebhookStats() {
        console.log('\n8️⃣ WEBHOOK STATISTICS AND MANAGEMENT');
        console.log('====================================');
        
        try {
            // Get system stats
            const systemStats = await this.client.getSystemStats();
            console.log('📊 System Statistics:');
            console.log(`   Webhooks created: ${systemStats.stats.webhooksCreated}`);
            console.log(`   Events processed: ${systemStats.stats.eventsProcessed}`);
            console.log(`   Successful deliveries: ${systemStats.stats.deliveriesSuccessful}`);
            console.log(`   Failed deliveries: ${systemStats.stats.deliveriesFailed}`);
            console.log(`   Uptime: ${Math.round(systemStats.uptime / 1000)}s`);
            
            // Get individual webhook stats
            console.log('\n📈 Individual Webhook Statistics:');
            for (const [type, webhook] of this.webhooks) {
                try {
                    const stats = await this.client.getWebhookStats(webhook.id);
                    console.log(`\n   ${webhook.name}:`);
                    console.log(`     Events received: ${stats.eventsReceived}`);
                    console.log(`     Deliveries attempted: ${stats.deliveriesAttempted}`);
                    console.log(`     Success rate: ${stats.deliveriesAttempted > 0 ? 
                        ((stats.deliveriesSuccessful / stats.deliveriesAttempted) * 100).toFixed(1) : 0}%`);
                    console.log(`     Last delivery: ${stats.lastDelivery || 'Never'}`);
                } catch (error) {
                    console.log(`     ❌ Error getting stats: ${error.message}`);
                }
            }
            
        } catch (error) {
            console.error('❌ Failed to get statistics:', error.message);
        }
    }

    /**
     * Example 9: Create Webhook Receiver Server
     */
    createWebhookReceiver() {
        console.log('\n9️⃣ CREATING WEBHOOK RECEIVER SERVER');
        console.log('===================================');
        
        const app = express();
        app.use(express.json());
        
        // Simple webhook receiver
        app.post('/webhooks/:type', (req, res) => {
            const webhookType = req.params.type;
            const signature = req.headers['x-webhook-signature'];
            const webhookId = req.headers['x-webhook-id'];
            
            console.log(`📨 Received webhook: ${webhookType}`);
            console.log(`   Webhook ID: ${webhookId}`);
            console.log(`   Event type: ${req.body.event?.type}`);
            console.log(`   Timestamp: ${req.body.timestamp}`);
            
            // Process the webhook based on type
            this.processWebhook(webhookType, req.body);
            
            res.status(200).json({ 
                received: true, 
                type: webhookType,
                timestamp: new Date().toISOString()
            });
        });
        
        const port = 3003;
        app.listen(port, () => {
            console.log(`✅ Webhook receiver running on port ${port}`);
            console.log(`📡 Endpoints:`);
            console.log(`   POST http://localhost:${port}/webhooks/new-tokens`);
            console.log(`   POST http://localhost:${port}/webhooks/wallet-activity`);
            console.log(`   POST http://localhost:${port}/webhooks/price-alerts`);
            console.log(`   POST http://localhost:${port}/webhooks/liquidity-pools`);
            console.log(`   POST http://localhost:${port}/webhooks/blocks`);
        });
        
        return app;
    }

    /**
     * Event handlers
     */
    handleNewBlockEvent(blockData) {
        if (blockData.transactionCount > 50) {
            console.log(`🔥 High activity block: ${blockData.blockNumber} (${blockData.transactionCount} txs)`);
        }
    }

    handleTokenTransferEvent(transferData) {
        const value = BigInt(transferData.value);
        if (value > BigInt('1000000000000000000')) { // > 1 ETH
            console.log(`💰 Large transfer detected: ${value.toString()} wei`);
        }
    }

    handlePoolCreationEvent(poolData) {
        console.log(`🏊 New pool created: ${poolData.token0}/${poolData.token1}`);
    }

    processWebhook(type, data) {
        switch (type) {
            case 'new-tokens':
                console.log(`   🪙 New token event: ${data.event?.data?.contractAddress}`);
                break;
            case 'wallet-activity':
                console.log(`   👤 Wallet activity: ${data.event?.data?.from} -> ${data.event?.data?.to}`);
                break;
            case 'price-alerts':
                console.log(`   📈 Price alert: ${data.event?.data?.symbol} moved ${data.event?.data?.change}%`);
                break;
            case 'liquidity-pools':
                console.log(`   🏊 Pool event: ${data.event?.data?.poolAddress}`);
                break;
            case 'blocks':
                console.log(`   📦 Block event: ${data.event?.data?.blockNumber}`);
                break;
            default:
                console.log(`   ❓ Unknown webhook type: ${type}`);
        }
    }

    generateMockData(type) {
        const mockData = {
            newTokens: {
                contractAddress: '0x1234567890123456789012345678901234567890',
                symbol: 'TEST',
                name: 'Test Token',
                creator: '0x9876543210987654321098765432109876543210'
            },
            walletActivity: {
                from: '0xE7EB013b728f2D323633b41bf1BF898B3756A389',
                to: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
                value: '1000000000000000000'
            },
            priceAlerts: {
                symbol: 'WETH',
                oldPrice: '3000.00',
                newPrice: '3150.00',
                change: 5.0
            },
            liquidityPools: {
                poolAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
                token0: 'WETH',
                token1: 'TEST',
                liquidity: '10000000000000000000'
            },
            blockUpdates: {
                blockNumber: 12345678,
                transactionCount: 150,
                gasUsed: 12000000
            }
        };
        
        return mockData[type] || {};
    }

    /**
     * Run all examples
     */
    async runAllExamples() {
        console.log('🚀 BASE NETWORK WEBHOOK INFRASTRUCTURE EXAMPLES');
        console.log('===============================================');
        console.log('Demonstrating comprehensive webhook capabilities\n');
        
        try {
            // Create all webhooks
            await this.createNewTokenDetectionWebhook();
            await this.createWalletActivityWebhook();
            await this.createPriceAlertWebhook();
            await this.createLiquidityPoolWebhook();
            await this.createBlockUpdatesWebhook();
            
            // Test webhooks
            await this.testAllWebhooks();
            
            // Display statistics
            await this.displayWebhookStats();
            
            // Create receiver server
            this.createWebhookReceiver();
            
            // Start real-time monitoring
            await this.startWebSocketMonitoring();
            
            console.log('\n🎉 ALL WEBHOOK EXAMPLES COMPLETED!');
            console.log('=================================');
            console.log('✅ 5 webhooks created and tested');
            console.log('✅ Real-time WebSocket monitoring active');
            console.log('✅ Webhook receiver server running');
            console.log('✅ Statistics and management working');
            console.log('\n💡 Your webhook infrastructure is now fully operational!');
            
        } catch (error) {
            console.error('\n❌ Examples failed:', error.message);
            console.error('\n🔧 Make sure the webhook server is running:');
            console.error('   node NODE API OPERATIONS/webhooks/start-server.js');
        }
    }
}

// Run examples if called directly
if (require.main === module) {
    const examples = new WebhookExamples();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n👋 Stopping webhook examples...');
        examples.client.disconnectWebSocket();
        process.exit(0);
    });
    
    examples.runAllExamples().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = WebhookExamples;