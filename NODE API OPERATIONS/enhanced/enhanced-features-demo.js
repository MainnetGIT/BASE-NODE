#!/usr/bin/env node
/**
 * Enhanced Features Demo
 * Demonstrate Alchemy-equivalent features using private node access
 */

const PrivateNodeEnhancer = require('./private-node-enhancer');
const DirectNodeAccess = require('./direct-node-access');

async function demonstrateEnhancedFeatures() {
    console.log('🚀 ENHANCED FEATURES DEMO - ALCHEMY EQUIVALENTS');
    console.log('================================================');
    console.log('Demonstrating how to get Alchemy-like data using your private BASE node\n');

    try {
        // Initialize enhanced clients
        const enhancer = new PrivateNodeEnhancer({
            rpcEndpoint: 'http://localhost:8545' // Will be proxied to server via SSH
        });

        const directAccess = new DirectNodeAccess();

        // Demo 1: Token Balances (alchemy_getTokenBalances equivalent)
        console.log('1️⃣  TOKEN BALANCES DISCOVERY');
        console.log('============================');
        
        const testAddress = '0xE7EB013b728f2D323633b41bf1BF898B3756A389';
        console.log(`Getting token balances for: ${testAddress}`);
        
        const tokenBalances = await enhancer.getTokenBalances(testAddress, {
            scanRecent: true,
            blocks: 500
        });
        
        console.log(`✅ Found ${tokenBalances.tokenBalances.length} tokens with balances:`);
        tokenBalances.tokenBalances.forEach(token => {
            console.log(`   💰 ${token.symbol}: ${token.tokenBalance} (${token.contractAddress})`);
        });

        // Demo 2: Token Metadata (alchemy_getTokenMetadata equivalent)
        console.log('\n2️⃣  TOKEN METADATA EXTRACTION');
        console.log('==============================');
        
        const wethAddress = '0x4200000000000000000000000000000000000006';
        console.log(`Getting metadata for WETH: ${wethAddress}`);
        
        const metadata = await enhancer.getTokenMetadata(wethAddress);
        console.log('✅ Token metadata retrieved:');
        console.log(`   📛 Name: ${metadata.name}`);
        console.log(`   🔤 Symbol: ${metadata.symbol}`);
        console.log(`   🔢 Decimals: ${metadata.decimals}`);
        console.log(`   📊 Total Supply: ${metadata.totalSupply}`);

        // Demo 3: Asset Transfers (alchemy_getAssetTransfers equivalent)
        console.log('\n3️⃣  ASSET TRANSFER MONITORING');
        console.log('==============================');
        
        console.log('Scanning recent asset transfers...');
        const transfers = await enhancer.getAssetTransfers({
            fromBlock: 'latest',
            toBlock: 'latest',
            category: ['token', 'erc20'],
            maxCount: 10
        });
        
        console.log(`✅ Found ${transfers.transfers.length} recent transfers:`);
        transfers.transfers.slice(0, 5).forEach(transfer => {
            console.log(`   🔄 ${transfer.asset}: ${transfer.value} from ${transfer.from.slice(0, 8)}... to ${transfer.to.slice(0, 8)}...`);
        });

        // Demo 4: Enhanced Gas Analysis
        console.log('\n4️⃣  ENHANCED GAS ANALYSIS');
        console.log('==========================');
        
        console.log('Analyzing gas price trends...');
        const gasAnalysis = await directAccess.getGasPriceAnalysis(20);
        
        if (gasAnalysis.analysis) {
            console.log('✅ Gas price analysis completed:');
            console.log(`   📈 Average: ${gasAnalysis.analysis.average} wei`);
            console.log(`   📉 Minimum: ${gasAnalysis.analysis.minimum} wei`);
            console.log(`   📊 Maximum: ${gasAnalysis.analysis.maximum} wei`);
            console.log(`   📈 Trend: ${gasAnalysis.analysis.trend}`);
            
            if (gasAnalysis.recommendations) {
                console.log('   💡 Recommendations:');
                console.log(`      🐌 Slow: ${gasAnalysis.recommendations.slow} wei`);
                console.log(`      ⚡ Standard: ${gasAnalysis.recommendations.standard} wei`);
                console.log(`      🚀 Fast: ${gasAnalysis.recommendations.fast} wei`);
            }
        }

        // Demo 5: Transaction Pool Analysis
        console.log('\n5️⃣  MEMPOOL/TRANSACTION POOL ANALYSIS');
        console.log('======================================');
        
        console.log('Accessing transaction pool data...');
        const poolStatus = await directAccess.getTransactionPoolStatus();
        
        console.log('✅ Transaction pool status:');
        console.log(`   🔄 Pending transactions: ${poolStatus.pendingCount}`);
        console.log(`   ⏰ Pool status: ${JSON.stringify(poolStatus.status)}`);

        // Demo 6: New Token Discovery
        console.log('\n6️⃣  NEW TOKEN DISCOVERY');
        console.log('========================');
        
        console.log('Scanning for newly deployed tokens...');
        const newTokens = await directAccess.discoverNewTokens(10);
        
        console.log(`✅ Scanned blocks ${newTokens.blocks}`);
        console.log(`🪙 Found ${newTokens.tokensFound} new tokens:`);
        if (newTokens.tokens) {
            newTokens.tokens.slice(0, 3).forEach(token => {
                console.log(`   🆕 ${token.symbol || 'UNKNOWN'} (${token.name || 'No name'})`);
                console.log(`      📍 Address: ${token.address}`);
                console.log(`      👤 Creator: ${token.creator}`);
                console.log(`      📦 Block: ${token.block}`);
            });
        }

        // Demo 7: Node Performance Metrics
        console.log('\n7️⃣  NODE PERFORMANCE METRICS');
        console.log('=============================');
        
        console.log('Getting detailed node performance data...');
        const syncDetails = await directAccess.getNodeSyncDetails();
        
        console.log('✅ Node performance metrics:');
        console.log(`   🔄 Sync status: ${syncDetails.performance?.syncStatus}`);
        console.log(`   📊 Current block: ${syncDetails.currentBlock}`);
        console.log(`   🆔 Chain ID: ${syncDetails.chainId}`);
        console.log(`   💾 Memory usage: ${syncDetails.performance?.memoryUsage}`);

        // Demo 8: Database Statistics
        console.log('\n8️⃣  DATABASE STATISTICS');
        console.log('=======================');
        
        console.log('Getting blockchain database statistics...');
        const dbStats = await directAccess.getDatabaseStats();
        
        console.log('✅ Database statistics:');
        console.log(`   💽 Total size: ${dbStats.totalSize}`);
        console.log(`   📁 LevelDB files: ${dbStats.levelDBFiles}`);

        // Demo 9: Peer Network Analysis
        console.log('\n9️⃣  PEER NETWORK ANALYSIS');
        console.log('==========================');
        
        console.log('Analyzing peer connectivity...');
        const peerInfo = await directAccess.getDetailedPeerInfo();
        
        console.log('✅ Peer network analysis:');
        console.log(`   👥 Total peers: ${peerInfo.analysis?.total || 0}`);
        console.log(`   📥 Inbound: ${peerInfo.analysis?.inbound || 0}`);
        console.log(`   📤 Outbound: ${peerInfo.analysis?.outbound || 0}`);
        console.log(`   🌍 Countries: ${peerInfo.analysis?.countries || 0}`);

        // Demo 10: Debug Capabilities Check
        console.log('\n🔟 DEBUG CAPABILITIES CHECK');
        console.log('============================');
        
        console.log('Checking available debug features...');
        const debugStatus = await directAccess.enableDebugTracing();
        
        if (debugStatus.available) {
            console.log('✅ Debug tracing available!');
            console.log(`   🐛 Available modules: ${Object.keys(debugStatus.modules || {}).join(', ')}`);
        } else {
            console.log('⚠️  Debug tracing not enabled');
            console.log(`   💡 ${debugStatus.instruction || debugStatus.reason}`);
        }

        console.log('\n🎉 ENHANCED FEATURES DEMONSTRATION COMPLETE!');
        console.log('==============================================');
        console.log('Your private BASE node can provide most Alchemy features through:');
        console.log('✅ Direct RPC calls for standard blockchain data');
        console.log('✅ Smart contract interactions for token metadata');
        console.log('✅ Event log analysis for transfer tracking');
        console.log('✅ Direct node access for mempool and performance data');
        console.log('✅ Historical analysis for gas optimization');
        console.log('✅ Real-time monitoring for new token discovery');
        console.log('');
        console.log('💡 These capabilities match or exceed Alchemy\'s paid features!');

    } catch (error) {
        console.error('\n❌ Demo failed:', error.message);
        console.error('\n🔧 Possible issues:');
        console.error('   - BASE node not accessible via SSH');
        console.error('   - Network connectivity problems');
        console.error('   - Missing permissions or authentication');
        console.error('   - Node not fully synced');
        
        // Show what would be available with proper access
        console.log('\n💡 With proper node access, you would get:');
        console.log('✅ Real-time mempool monitoring');
        console.log('✅ Advanced gas price analytics');
        console.log('✅ New token discovery');
        console.log('✅ Enhanced performance metrics');
        console.log('✅ Direct database access');
    }
}

// Run demo if called directly
if (require.main === module) {
    demonstrateEnhancedFeatures().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { demonstrateEnhancedFeatures };